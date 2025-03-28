/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  extractAccount,
  extractCancel,
  extractCurrency,
  playAudio,
} from "../../util/util";
import { ExtractResponse } from "../bus-op.interface";
import { chatStoreService } from "../chat-store.service";
import { myChatbotServiceAgent } from "../chatbot-service-agent";
import { translate } from "../i18n/i18n.service";
import { myLoggerService } from "../logger.service";
import { ChatbotAction, IProcessor } from "./processor.interface";

export class CashWithdrawalTxProcessor implements IProcessor {
  private lastStep = -1;
  private currentStep = -1;
  private template = {
    currency: "",
    amount: 0,
    cancel: false,
    account: "",
  };

  constructor() {
    myLoggerService.log("create CashWithdrawalTxProcessor");
  }
  async start() {
    myLoggerService.log("CashWithdrawalTxProcessor: start");
    this.lastStep = -1;
    this.currentStep = -1;

    const nextAction: ChatbotAction = this.findNextStep();
    if (nextAction.actionType === "ContinueTransaction") {
      playAudio(nextAction.prompt!);
    } else {
      myLoggerService.log("Invalid action");
    }
  }

  async processAtmMessage(message: any): Promise<ChatbotAction> {
    myLoggerService.log(
      "CashWithdrawalTxProcessor: processAtmMessage" + JSON.stringify(message)
    );

    let nextAction: ChatbotAction = {
      actionType: "None",
    };
    switch (message.event) {
      case "note-mix":
        if (message.parameters.success) {
        chatStoreService.sessionContext!.transactionContext!.noteMixPerformed =
          message.parameters.success;
        } else {
          chatStoreService.sessionContext!.transactionContext!.amount = undefined;
        }
        nextAction = this.findNextStep();
        break;
      case "notification":
        nextAction = {
          actionType: "ContinueSession",
          prompt: [message.parameters.vg],
          playAudioOnly: true,
        };
        break;
    }

    switch (message.action) {
      case "end-transaction":
        nextAction = {
          actionType: "EndTransaction",
        };
        break;
    }

    return nextAction;
  }

  async processText(text: string): Promise<ChatbotAction> {
    myLoggerService.log("CashWithdrawalTxProcessor: processText: " + text);
    const req = {
      text: text,
      instruction:
        "supported accounts: 'saving', 'credit', 'cheque','check' or 'credit', extract amount or number as amount, extract currency as currency",
      format: this.template,
      language: chatStoreService.language
    };

    const res: ExtractResponse = await myChatbotServiceAgent.extract(
      JSON.stringify(req)
    );
    myLoggerService.log(res);

    try {
      if (res && res.data && res.data.data) {
        const txData = JSON.parse(res.data.data);
        console.log("txData", txData);
        if (extractCancel(txData.cancel)) {
          return {
            actionType: "Cancel",
          };
        }

        if (!chatStoreService.sessionContext!.transactionContext!.amount)
          chatStoreService.sessionContext!.transactionContext!.amount = {};

        if (txData.amount > 0)
          chatStoreService.sessionContext!.transactionContext!.amount!.value =
            txData.amount;
        if (txData.currency)
          chatStoreService.sessionContext!.transactionContext!.amount!.currency =
            extractCurrency(txData.currency);
        if (txData.account)
          chatStoreService.sessionContext!.transactionContext!.selectedAccount =
            extractAccount(txData.account);

        myLoggerService.log(
          "transactionContext: " +
            JSON.stringify(chatStoreService.sessionContext!.transactionContext!)
        );
      }
    } catch (e) {
      console.log("extract error:", e);
    }

    const action: ChatbotAction = this.findNextStep();
    myLoggerService.log(
      "nextAction: " +
        JSON.stringify(action) +
        " currentStep:" +
        this.currentStep
    );

    if (
      action.actionType === "ContinueTransaction" &&
      this.currentStep === this.lastStep
    ) {
      action.playAudioOnly = true;
    }
    this.lastStep = this.currentStep;

    return action;
  }

  private findNextStep(): ChatbotAction {
    myLoggerService.log("findNextStep: currentStep: " + this.currentStep);

    const nextAction: ChatbotAction = {
      actionType: "ContinueTransaction",
      prompt: [],
    };

    //step 1
    this.currentStep = 1;
    if (!chatStoreService.sessionContext!.transactionContext?.selectedAccount) {
      nextAction.prompt = [translate("cashWithdrawal_Account")];
      return nextAction;
    }

    //step 3
    this.currentStep = 3;
    if (
      !chatStoreService.sessionContext!.transactionContext?.amount ||
      !chatStoreService.sessionContext!.transactionContext?.amount.currency ||
      !chatStoreService.sessionContext!.transactionContext?.amount.value
    ) {
      nextAction.prompt = [translate("cashWithdrawal_Currency_Amount")];
      return nextAction;
    }

    //step 4
    this.currentStep = 4;
    if (!chatStoreService.sessionContext!.transactionContext?.amount.currency) {
      nextAction.prompt = [translate("cashWithdrawal_Currency")];
      return nextAction;
    }

    //step 5
    this.currentStep = 5;
    if (!chatStoreService.sessionContext!.transactionContext?.amount.value) {
      nextAction.prompt = [translate("cashWithdrawal_Amount")];
      return nextAction;
    }

    //step 6
    this.currentStep = 6;
    if (!chatStoreService.sessionContext!.transactionContext.noteMixPerformed) {
      nextAction.actionType = "AtmInteraction";
      nextAction.prompt = [translate("pleaseWait")];
      nextAction.interactionMessage = {
        action: "note-mix",
        parameters: {
          currency:
            chatStoreService.sessionContext.transactionContext!.amount!
              .currency,
          amount:
            chatStoreService.sessionContext.transactionContext!.amount!.value,
        },
      };
      return nextAction;
    }

    //step 7
    this.currentStep = 7;
    if (!chatStoreService.sessionContext!.transactionContext.executeCompleted) {
      nextAction.actionType = "AtmInteraction";
      nextAction.prompt = [translate("pleaseWait")];
      nextAction.interactionMessage = {
        action: "cash-withdrawal",
        parameters: {
          currency:
            chatStoreService.sessionContext.transactionContext!.amount!
              .currency,
          amount:
            chatStoreService.sessionContext.transactionContext!.amount!.value,
          accountType:
            chatStoreService.sessionContext!.transactionContext.selectedAccount,
          receiptRequested: true,
        },
      };
      return nextAction;
    }

    return nextAction;
  }
}
