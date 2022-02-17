import * as fs from "fs";
import { DownloaderHelper } from "node-downloader-helper";

var boardName = "";

const clearLine = () => process.stdout.write("\r" + ' '.repeat(process.stdout.columns) + "\r");

let thread = class {
  no: string;
  replies: number;
  constructor(no: string, replies: number) {
    this.no = no;
    this.replies = replies;
  }
}

const downloadThread = (name: string, dest: string, newFileName: string) => {
  return new Promise((resolve, reject) => {
    const dl = new DownloaderHelper(name, dest,
      {override: true,
      retry: { maxRetries: 3, delay: 1000 * 20 },
      httpRequestOptions: { timeout: 5000 },
      fileName: newFileName });
    dl.on("end", () => {
      resolve(null);
    });
    dl.on("error", (error) => {
      reject(error);
    });
    dl.start().catch((error) => {  reject(error); });
  });
}

var list = new Array<any>();

async function downloadFunction() {
  process.stdout.write("scraping " + boardName + "...");
  // the catalog probably won't disappear, but it'll gladly give a 500 error.
  try {
    await downloadThread("https://a.4cdn.org/" + boardName + "/catalog.json", ".", "catalog_" + boardName + ".json");
  } catch {
    console.log("couldn't get catalog.");
    setTimeout(downloadFunction, 60 * 1000);
    return;
  }
  var catalog = JSON.parse(fs.readFileSync("catalog_" + boardName + ".json", "utf-8"));
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
      } catch (error) {
        if(!(error instanceof TypeError))
          throw error;
      }
    }
  }
  var threadCount = newThreads + oldThreads;
  console.log(threadCount + (threadCount !== 1 ? " threads need " : " thread needs ") + "to be downloaded; " + newThreads + (newThreads !== 1 ? " are new." : " is new."));
  if(threadCount == 0) return;
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
  if(fs.existsSync("logs/" + boardName)) {
    var files = fs.readdirSync("logs/" + boardName);
    var threadCount = 0;
    for(var c = 0; c < files.length; c++) {
      var f = files[c];
      try {
        threadCount++;
        var thisThread = JSON.parse(fs.readFileSync("logs/" + boardName + "/" + f, "utf-8"));
        var entry = new thread(thisThread.posts[0].no, thisThread.posts[0].replies);
        list.push(entry);
      } catch {
        // bad thread
        threadCount--;
        fs.rmSync("logs/" + boardName + "/" + f);
      }
      process.stdout.write("\rimporting " + threadCount + " of " + files.length + " threads..." + Math.round((threadCount / files.length) * 100) + "%");
    }
    if(threadCount > 0) {
      clearLine();
      console.log("imported " + threadCount + " existing threads.");
    }
  }
}

if(!fs.existsSync("logs")) fs.mkdirSync("logs");
if(!fs.existsSync("logs/" + boardName)) fs.mkdirSync("logs/" + boardName);

var mode = process.argv[2];
if(mode === "scrape") {
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
    var thisThread = JSON.parse(fs.readFileSync("logs/" + boardName + "/" + list[0].no + ".json", "utf-8")).posts;
    for(var c = 0; c < list[0].replies; c++) {
      // get rid of HTML and quotes
      var newOut = thisThread[c].com;
      if(newOut === undefined) continue;
      newOut = newOut
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
