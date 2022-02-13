import * as fs from "fs";
import axios from "axios";
import { DownloaderHelper } from "node-downloader-helper";
import { htmlToText } from "html-to-text";

const clearLine = () => process.stdout.write("\r" + ' '.repeat(process.stdout.columns) + "\r");

async function urlExists (url: string): Promise<boolean> {
  try {
    await axios.head(url);
    return true;
  } catch (error: any) {
    return false;
  }
}

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
    const dl = new DownloaderHelper(name, dest,
      {override: true,
      retry: { maxRetries: 3, delay: 3000 },
      httpRequestOptions: { timeout: 5000 }});
    dl.on("end", () => {
      resolve(null);
    });
    dl.on("retry", () => {
      console.log("\nTrying that one again...");
    });
    dl.start();
  });
}

var list = new Array<any>();

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
    clearLine();
    process.stdout.write("\rimporting " + threadCount + " of " + files.length + " threads..." + Math.round((threadCount / files.length) * 100) + "%");
  }
  if(threadCount > 0) {
    clearLine();
    console.log("imported " + threadCount + " existing threads.");
  }
}

if(!fs.existsSync("logs")) fs.mkdirSync("logs");

async function downloadFunction() {
  // scrape pol
  process.stdout.write("scraping pol...");
  // the catalog probably won't disappear, but it'll gladly give a 500 error.
  var exists = await urlExists("https://a.4cdn.org/pol/catalog.json");
  if(exists) await downloadThread("https://a.4cdn.org/pol/catalog.json", ".");
  else {
    console.log("couldn't get catalog.");
    setTimeout(downloadFunction, 60 * 1000);
    return;
  }
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
      } catch (error) {
        if(!(error instanceof TypeError))
          throw error;
      }
    }
  }
  var threadCount = newThreads + oldThreads;
  console.log(threadCount + " threads need to be downloaded; " + newThreads + " are new. ");
  if(threadCount == 0) return;
  var downloadedThreads = 0;
  do {
    var exists = await urlExists(downloads[0]);
    if(exists) await downloadThread(downloads[0], "logs");
    downloadedThreads++;
    process.stdout.write("\rdownloading " + downloadedThreads + " of " + threadCount + " threads..." + Math.round((downloadedThreads / threadCount) * 100) + "%");
    downloads.shift();
  } while(downloads[0] !== undefined);
  console.log(". done.");
  setTimeout(downloadFunction, 60 * 1000);
}

if(process.argv.length != 3) {
  console.log("input either scrape or export");
  process.exit();
}

var mode = process.argv[2];
if(mode === "scrape") {
  downloadFunction();
} else if(mode === "export") {
  var output = "";
  console.log("exporting data...");
  var totalThreads = list.length;
  var threadsDone = 0;
  do {
    var thisThread = JSON.parse(fs.readFileSync("logs/" + list[0].no + ".json", "utf-8")).posts;
    for(var c = 0; c < list[0].replies; c++) {
      // get rid of HTML and quotes
      var newOut =  htmlToText(thisThread[c].com).replace(/[>][>](\d*)/, "").replace("\n", " ").trim();
      do {
        newOut = newOut.replace("  "," ");
      } while(newOut.includes("  "));
      output += newOut + "\n\n";
    }
    list.shift();
    threadsDone++;
    process.stdout.write("\rprocessing " + threadsDone + " out of " + totalThreads + " threads..." + Math.round((threadsDone / totalThreads) * 100) + "%");
  } while (list[0] !== undefined);
  fs.writeFileSync("export.txt", output);
  console.log("\nwrote output to export.txt.");
} else {
  console.log("input either scrape or export");
}
