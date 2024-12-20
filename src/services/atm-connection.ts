
import { ConnectionOptions, WebSocketConnectionImpl } from "./websocket";



export class AtmConnectionImpl {
    private connection!: WebSocketConnectionImpl;
    opt: ConnectionOptions | undefined;


    init(opt: ConnectionOptions) {
        this.opt = opt;
    }
    onMessage = (strMsg: string) => {
        const message = JSON.parse(strMsg);
        if (message) {
           console.log("message received",message);
        }
    };
    async connect() {
        try {
            this.connection = new WebSocketConnectionImpl({ ...this.opt!, onMessage: this.onMessage });
            return true;
        } catch (e) {
            console.log("connect, url = " + this.opt?.wsUrl);
            console.log(e + " ");
        }
        return false;
    }

    send(message: any) {
        try {
            if (message) {
                const msg = JSON.stringify(message);
                console.log("send message to external application: " + msg);
                this.connection.send(msg);
            }
        } catch (e) {
            console.log(e + " ");
        }
    }
}

const myATMConnection: AtmConnectionImpl = new AtmConnectionImpl();
export { myATMConnection  };