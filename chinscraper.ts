import * as fs from "fs";
import { DownloaderHelper } from "node-downloader-helper";

// thread list
var list = new Array<any>();
var boardName = "";
var fullyLoaded = false;
process.on("SIGINT", () => { // ctrl+c
  if(fullyLoaded) {
    fs.writeFileSync("savedthreads_" + boardName + ".json", JSON.stringify(list));
    console.log("overwrote saved threads file.");
  }
  process.exit();
});

const clearLine = () => process.stdout.write("\r" + ' '.repeat(process.stdout.columns) + "\r");

let thread = class {
  no: string;
  replies: string;
  constructor(no: string, replies: string) {
    this.no = no;
    this.replies = replies;
   }
}

function getElement(s: string, left: string, right: string): string {
  var location = s.indexOf(left) + left.length;
  return s.substring(location, s.indexOf(right, location));
}

const downloadThread = (name: string, dest: string, newFileName: string) => {
  return new Promise((resolve, reject) => {
    const dl = new DownloaderHelper(name, dest,
      {override: true,
      retry: { maxRetries: 3, delay: 1000 * 2 },
      httpRequestOptions: { timeout: 5000 },
      fileName: newFileName });
    dl.on("end", () => {
      resolve(null);
    });
    dl.on("error", (error) => {
      reject(error);
    });
    dl.start().catch((error) => { reject(error); });
  });
}

async function downloadFunction() {
  process.stdout.write("scraping " + boardName + "...");
  // the thread list probably won't disappear, but it'll gladly give a 500 error.
  try {
    await downloadThread("https://a.4cdn.org/" + boardName + "/threads.json", ".", "threads_" + boardName + ".json");
  } catch {
    console.log("couldn't get thread list.");
    setTimeout(downloadFunction, 60 * 1000);
    return;
  }
  // this effectively splits the list into threads
  var threads = fs.readFileSync("threads_" + boardName + ".json", "utf-8").replaceAll("]},{","").split(",{");
  var newThreads = 0;
  var oldThreads = 0;
  var downloads = new Array<string>();
  // go through the threads
  for(var c = 0; c < threads.length; c++) {
    var no = getElement(threads[c], "\"no\":", ",");
    var replies = getElement(threads[c], "\"replies\":", "}");
    var t = new thread(no, replies);
    // try to find thread in list
    var found = false;
    for(var e = 0; e < list.length; e++) {
      if(list[e].no === t.no) {
        found = true;
        // same thread!
        if(+list[e].replies < +t.replies) {
          list[e].replies = t.replies;
          oldThreads++;
          downloads.push("https://a.4cdn.org/" + boardName + "/thread/" + t.no + ".json");
          break;
        }
      }
    }
    if(found === false) {
      list.push(t);
      downloads.push("https://a.4cdn.org/" + boardName + "/thread/" + t.no + ".json");
      newThreads++;
    }
  }

  var threadCount = newThreads + oldThreads;
  console.log(threadCount + (threadCount !== 1 ? " threads need " : " thread needs ") + "to be downloaded; " + newThreads + (newThreads !== 1 ? " are new." : " is new."));
  if(threadCount == 0) {
    setTimeout(downloadFunction, 60 * 1000);
    return;
  }
  var downloadedThreads = 0;
  var errors = 0;
  do {
    try {
      await downloadThread(downloads[0], boardName, downloads[0].split("/")[downloads[0].split("/").length - 1]);
    } catch { errors++; }
    downloadedThreads++;
    var outString = "\rdownloading " + downloadedThreads + " of " + threadCount + " threads..." + Math.round((downloadedThreads / threadCount) * 100) + "%";
    if(errors > 0) outString += " (" + errors + " error" + (errors > 1 ? "s" : "") + ")";
    process.stdout.write(outString);
    downloads.shift();
  } while(downloads[0] !== undefined);
  await fs.writeFile("savedthreads_" + boardName + ".json", JSON.stringify(list), () => { });
  console.log(". done.");
  setTimeout(downloadFunction, 60 * 1000);
}

if(process.argv.length != 4) {
  console.log("input: npm start [scrape/export] [board name]");
  process.exit();
}

boardName = process.argv[3];

// import existing threads
if(fs.existsSync("logs")) {
  if(fs.existsSync("logs/savedthreads_" + boardName + ".txt")) {
    list = JSON.parse(fs.readFileSync("logs/savedthreads_" + boardName + ".json", "utf-8"));
    console.log("imported " + list.length + " existing threads.");
  }
}

if(!fs.existsSync("logs")) fs.mkdirSync("logs");
if(!fs.existsSync("logs/" + boardName)) fs.mkdirSync("logs/" + boardName);

var mode = process.argv[2];
if(mode === "scrape") {
  fullyLoaded = true;
  process.chdir("logs");
  downloadFunction();
} else if(mode === "export") {
  if(list.length === 0) {
    console.log("nothing to export.");
    process.exit();
  }
  console.log("exporting data...");
  var totalThreads = list.length;
  var threadsDone = 0;
  var writeStream = fs.createWriteStream("export_" + boardName + ".txt");
  do {
    var thisThread2 = fs.readFileSync("logs/" + boardName + "/" + list[0].no + ".json", "utf-8").split("},{");
    for(var c = 0; c < thisThread2.length; c++) {
      // get rid of HTML and quotes
      var newOut = getElement(thisThread2[c], "\"com\":\"", "\",");
      if(newOut === undefined) continue;
      newOut = newOut
        .replaceAll("\\/", "/")
        .replaceAll("&#039;", "\'")
        .replaceAll("&gt;",">")
        .replaceAll("&quot;","\"")
        .replaceAll("<br>","\n")
        .replaceAll(/(>>)([0-9]*)\w+/gm, "")
        .replaceAll(/<[^>]+>/g, "")
        .trim();
      do {
        newOut = newOut.replace("  "," ");
      } while(newOut.includes("  "));
      writeStream.write(newOut + "\n\n");
    }
    list.shift();
    threadsDone++;
    process.stdout.write("\rprocessing " + threadsDone + " out of " + totalThreads + " threads..." + Math.round((threadsDone / totalThreads) * 100) + "%");
  } while (list[0] !== undefined);
  writeStream.end();
  console.log("\nwrote output to export_" + boardName + ".txt.");
} else {
  console.log("input either scrape or export");
}
