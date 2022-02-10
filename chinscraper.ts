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

const downloadThread = (name: string, dest: string) => {
  return new Promise((resolve) => {
    const dl = new DownloaderHelper(name, dest, {override: true});
    dl.on("end", () => {
      resolve(null);
    });
    dl.start();
  });
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
  process.stdout.write("scraping pol...");
  await downloadThread("https://a.4cdn.org/pol/catalog.json", ".");
  var catalog = JSON.parse(fs.readFileSync("catalog.json", "utf-8"));
  var newThreads = 0;
  var oldThreads = 0;
  var downloads = new Array<string>();
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
              downloads.push("https://a.4cdn.org/pol/thread/" + t.no + ".json");
              break;
            }
          }
        }
        if(found === false) {
          list.push(t); 
          downloads.push("https://a.4cdn.org/pol/thread/" + t.no + ".json");
          newThreads++;
        }
      } catch { }
    }
  }
  var threadCount = newThreads + oldThreads;
  process.stdout.write(threadCount + " threads need to be downloaded; " + newThreads + " are new. ");
  if(threadCount == 0) return;
  do {
    await downloadThread(downloads[0], "logs");
    downloads.shift();
  } while(downloads[0] !== undefined);
  console.log("done.");
  setTimeout(downloadFunction, 60 * 1000);
}

downloadFunction();

