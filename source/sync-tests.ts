import {
  readdir as readdirCB,
  realpath as realpathCB,
  stat as statCB
} from "fs";
import { promisify } from "util";
import { SourceFile } from "./source-file";
import { Source } from "./source";
const readdir = promisify(readdirCB);
const realpath = promisify(realpathCB);
const stat = promisify(statCB);

(async () => {
  const sourceDir = await realpath(__dirname + "/../../../source");
  const testsDir = await realpath(__dirname + "/../../../tests");

  await processDir();

  async function processDir(subdir: string = "") {
    const files = await readdir(sourceDir + subdir);
    for (const name of files) {
      const childSubpath = `${subdir}/${name}`;
      const dirent = await stat(sourceDir + childSubpath);
      if (dirent.isFile() && name.endsWith(".ts")) {
        const sourceFile = new SourceFile(childSubpath, sourceDir, testsDir);
        const source = await Source.withFile(sourceFile);
        console.log(source.tests);
      }
      if (dirent.isDirectory()) {
        await processDir(childSubpath);
      }
    }
  }
})();
