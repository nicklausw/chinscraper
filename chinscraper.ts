import fs from "fs";
import { DownloaderHelper } from "node-downloader-helper";

let thread = class {
  no: string;
  replies: number;
  constructor(no: string, replies: number) {
    this.no = no;
    this.replies = replies;
  }
}

var list = new Array<any>();
console.log("Scraper started");

// import existing threads
if(fs.existsSync("logs")) {
  var files = fs.readdirSync("logs");
  var threadCount = 0;
  for(var c = 0; c < files.length; c++) {
    var f = files[c];
    try {
      threadCount++;
      var thisThread = JSON.parse(fs.readFileSync("logs/" + f, "utf-8"));
      var entry = new thread(thisThread.posts[0].no, thisThread.posts[0].replies);
      list.push(entry);
    } catch {
      // bad thread
      threadCount--;
      fs.rmSync("logs/" + f);
    }
  }
  if(threadCount > 0)
    console.log("loaded " + threadCount + " existing threads.");
}

if(!fs.existsSync("logs")) fs.mkdirSync("logs");

async function downloadFunction() {
  // scrape pol
  console.log("scraping pol...");
  const dl = new DownloaderHelper("https://a.4cdn.org/pol/catalog.json", ".", {override: true});
  dl.on("end", () => {
    var catalog = JSON.parse(fs.readFileSync("catalog.json", "utf-8"));
    var newThreads = 0;
    var oldThreads = 0;
    // go through the 10 pages of threads
    for(var c = 0; c <= 10; c++) {
      // go through the 20 possible threads
      for(var d = 0; d <= 19; d++) {
        try {
          var t = new thread(catalog[c]["threads"][d].no, catalog[c]["threads"][d].replies);
          // try to find thread in list
          var found = false;
          for(var e = 0; e < list.length; e++) {
            if(list[e].no === t.no) {
              found = true;
              // same thread!
              if(list[e].replies < t.replies) {
                list[e].replies = t.replies;
                oldThreads++;
                const dl = new DownloaderHelper("https://a.4cdn.org/pol/thread/" + t.no + ".json", "logs", {override: true});
                dl.start();
                break;
              }
            }
          }
          if(found === false) {
            list.push(t); 
            const dlnew = new DownloaderHelper("https://a.4cdn.org/pol/thread/" + t.no + ".json", "logs", {override: true});
            dlnew.start();
            newThreads++;
          }
        } catch { }
      }
    }
    var threadCount = newThreads + oldThreads;
    console.log(threadCount + " threads need to be downloaded; " + newThreads + " are new.");
  })
  dl.start();
}

downloadFunction();
setInterval(downloadFunction, 60 * 1000); // 60 * 1000 milsec

