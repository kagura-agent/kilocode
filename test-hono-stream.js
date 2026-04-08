import { ReadableStream } from "node:stream/web";

const stream = new ReadableStream({
  start(controller) {
    controller.close();
    try {
      controller.close();
      console.log("Safe to double close");
    } catch(e) {
      console.log("Double close error:", e.message);
    }
  }
});
