import { mkdir as mkdirCB, readFile as readFileCB, writeFile as writeFileCB } from "fs";
import { promisify } from "util";
import { dirname } from "path";
const mkdir = promisify(mkdirCB);
const readFile = promisify(readFileCB);
const writeFile = promisify(writeFileCB);

export class SourceFile {
  filename: string;
  testBody: string | undefined;
  sourceBody: string | undefined;

  sourceDir: string;
  testsDir: string;

  constructor(subpath: string, sourceDir: string, testsDir: string) {
    this.sourceDir = sourceDir;
    this.testsDir = testsDir;
    this.filename = subpath;
  }

  get sourcePath(): string {
    return this.sourceDir + this.filename;
  }

  get testPath(): string {
    return this.testsDir + this.filename;
  }

  async makeTestDir() {
    await mkdir(dirname(this.testPath), { recursive: true });
  }

  async writeTestFile(body: string) {
    this.makeTestDir();
    await writeFile(this.testPath, body);
  }

  async readTestFile(): Promise<string> {
    return this.testBody || (this.testBody = await readFile(this.testPath, "utf8").catch(() => ""));
  }

  async readSourceFile(): Promise<string> {
    return this.sourceBody || (this.sourceBody = await readFile(this.sourcePath, "utf8"));
  }
}
