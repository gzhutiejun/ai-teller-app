/* eslint-disable @typescript-eslint/no-explicit-any */
import { extractTranscribedData, getGreetingTime } from "../../util/util";
import { chatStoreService } from "../chat-store.service";
import {
  myChatbotServiceAgent
} from "../chatbot-service-agent";
import { myLoggerService } from "../logger.service";
import { ChatbotAction, IProcessor, TransactionName } from "./processor.interface";

export class SessionProcessor implements IProcessor {
  chatbotWebUrl: string = "";
  private nextAction: ChatbotAction;
  constructor() {
    myLoggerService.log("create Session Processor");
    this.nextAction = {};
  }
  async start() {
    myLoggerService.log("SessionProcessor: start");

    const sessionRes = await myChatbotServiceAgent?.opensession(
      JSON.stringify({
        action: "opensession",
      })
    );
    if (
      sessionRes &&
      sessionRes.responseMessage &&
      sessionRes.responseMessage.session_id
    ) {
      chatStoreService.setSessionId(sessionRes.responseMessage.session_id);

      const helloMessage = `Good ${getGreetingTime()}, I am NCR teller assistant, what services do you need?`;
      chatStoreService.clearAgentMessages();
      chatStoreService.addAgentMessage(helloMessage);
      const ttsRes = await myChatbotServiceAgent?.generateaudio(
        JSON.stringify({
          action: "generateaudio",
          sessionId: chatStoreService.sessionContext.sessionId,
          text: helloMessage,
        })
      );

      if (
        ttsRes &&
        ttsRes.responseMessage &&
        ttsRes.responseMessage.file_name
      ) {
        chatStoreService.setAudioUrl(
          `${this.chatbotWebUrl}/download/${ttsRes.responseMessage.file_name}`
        );
      }
    }
  }

  async process(text: string): Promise<ChatbotAction> {
    myLoggerService.log("SessionProcessor: process:" + text);
    const req = {
      text: text,
      instruction:
        "we support transactions: cash deposit, cash withdrawal, transfer, please extract the transaction is requested.",
      format: {
        transaction: "",
        cancel: false,
      },
    };
    const res = await myChatbotServiceAgent.extract(JSON.stringify(req));
    myLoggerService.log(res);

    const data = extractTranscribedData(res);
    myLoggerService.log("Transcribed data:" + JSON.stringify(data));
    this.nextAction = {}
    const tx = this.identifyTransactionName(data);
    if (tx !== "none") {
      // start a new transaction
      this.nextAction = {
        actionType: "NewTransaction",
        transactionName: tx
      };
      return this.nextAction;
    }

    this.nextAction = {
      actionType: "Continue",
      prompt: {
        messages: ["what services do you need?"],
      },
    };

    return this.nextAction;
  }

  private identifyTransactionName(data: any): TransactionName {
    if (!data.transaction) return "none";
    const val: string = data.transaction.toLowerCase();
    if (!val) return "none";
    if (val.includes("withdraw")) return "cash-withdrawal";
    if (val.includes("time") && val.includes("deposit")) return "time-deposit";    
    return "none"
  }
}
