import { SourceFile } from "./source-file";
import { TSESTree, AST_NODE_TYPES } from "@typescript-eslint/typescript-estree";
import * as parser from "@typescript-eslint/parser/dist/parser";
import {
  Statement,
  ClassElement,
  LineAndColumnData,
  Expression
} from "@typescript-eslint/typescript-estree/dist/ts-estree/ts-estree";
enum ContextType {
  class = "class",
  method = "method",
  note = "note",
  assertion = "assertion",
  testContext = "testContext"
}

type Context = {
  type: ContextType;
  description?: string;
  range: [number, number];
  lineRange: [LineAndColumnData, LineAndColumnData];

  children: Context[];
  parent: Context | undefined;
};

type Test = Context & {
  description: string;
};

type AnyNode = Statement | ClassElement | Expression;

export class Source {
  file: SourceFile;
  body = "";
  lines: string[] = [];
  contexts: Context[] = [];
  tests: Test[] = [];
  ast: TSESTree.Program | undefined;

  constructor(file: SourceFile) {
    this.file = file;
  }

  parse(): void {
    try {
      this.ast = parser.parseForESLint(this.body, {
        ecmaVersion: 2019,
        sourceType: "module",
        comment: true
      }).ast;
    } catch (error) {
      this.ast = undefined;
      console.error(
        `Could not parse file ${this.file.filename}: ${error.message}`
      );
    }
    this.contexts.length = 0;
    this.tests.length = 0;
    if (this.ast) {
      this.ast.body.forEach(statement =>
        this.contexts.push(...this.convertStatement(statement))
      );
      if (this.ast.comments) {
        const lineComments = this.ast.comments.filter(
          ({ type }) => type == "Line"
        );

        let contextStack: (Context | undefined)[] = [];
        let prevEnd: number | undefined;
        for (const { loc, range, value } of lineComments) {
          if (range[0] == prevEnd) prevEnd = range[1];
          else contextStack.length = 0;

          const match = /^\?( +)(?:\.\.\.\s*)?(?:it (.*)|(.*))$/.exec(value);
          if (!match) continue;
          const [_, indent, assertion, contextBody] = match;

          if (!contextStack.length) contextStack.push(this.contextAt(range[0]));
          if (!contextStack[0]) continue;
          const filledContextStackLength = contextStack.length;
          contextStack.length = indent.length - 1;
          if (filledContextStackLength < contextStack.length) {
            contextStack.fill(
              contextStack[filledContextStackLength - 1],
              filledContextStackLength,
              contextStack.length
            );
          }
          const parent = contextStack[contextStack.length - 1];
          const test: Test = {
            type: assertion ? ContextType.assertion : ContextType.testContext,
            range,
            lineRange: [loc.start, loc.end],
            children: [],
            parent,
            description: assertion || contextBody
          };
          if (parent) parent.children.push(test);
          if (contextBody) contextStack.push(test);
        }
      }
    }
  }

  //?   With a line comment
  //?     ... that starts at char 0
  //?       ... it should do the same as usual

  contextAt(location: number): Context | undefined {
    return this.contexts.find(context => inside(context));
    function inside(context: Context): Context | undefined {
      if (location < context.range[0] || location >= context.range[1]) return;

      let desc: Context | undefined;

      context.children.find(child => (desc = inside(child)));
      return desc || context;
    }
  }

  convertStatement(statement: AnyNode, parent?: Context): Context[] {
    const source = this;

    switch (statement.type) {
      case AST_NODE_TYPES.ClassDeclaration:
      case AST_NODE_TYPES.ClassExpression: {
        const context: Context = {
          type: ContextType.class,
          description: `${statement.id ? statement.id.name : "unamed-class"}`,
          range: statement.range,
          lineRange: [statement.loc.start, statement.loc.end],
          children: [],
          parent
        };
        for (const child of statement.body.body)
          context.children.push(...source.convertStatement(child, context));
        return [context];
      }
      case AST_NODE_TYPES.MethodDefinition:
      case AST_NODE_TYPES.TSAbstractMethodDefinition: {
        if (
          !(
            "id" in statement.key &&
            "body" in statement.value &&
            statement.value.body
          )
        )
          break;
        const context: Context = {
          type: ContextType.method,
          description: `${
            statement.key.id ? statement.key.id.name : "unamed-class"
          }`,
          range: statement.range,
          lineRange: [statement.loc.start, statement.loc.end],
          children: [],
          parent
        };
        if (statement.value.body)
          context.children.push(
            ...source.convertStatement(statement.value.body, context)
          );
        return [context];
      }
    }
    const contexts: Context[] = [];

    if ("body" in statement) {
      if (Array.isArray(statement.body)) {
        for (const child of statement.body)
          contexts.push(...source.convertStatement(child, parent));
      } else if (statement.body && "id" in statement.body) {
        contexts.push(...source.convertStatement(statement.body, parent));
      }
    }
    if (
      "declaration" in statement &&
      statement.declaration &&
      "id" in statement.declaration
    ) {
      contexts.push(...source.convertStatement(statement.declaration, parent));
    }
    return contexts;
  }

  static async withFile(file: SourceFile) {
    const source = new Source(file);
    await source.asyncInit();
    return source;
  }

  async asyncInit() {
    this.body = await this.file.readSourceFile();
    this.lines = this.body.split("\n");
    this.parse();
    //    this.baseBlock=locateEnd(this.body, BlockType.wholeString)
    //    this.block = this.convertBaseBlock(this.baseBlock);

    console.log(this.file.filename);
    console.log(
      JSON.stringify(
        this.contexts,
        (key: string, val: any) => (key == "parent" ? undefined : val),
        2
      )
    );

    /*    this.tests = [];
    const re = /^ *\/\/\/? *Test(?:: *(.*)$|s: *)((?:\n\s*\/\/\/.*)+)/g;
    let match;
    while ((match = re.exec(this.body))) {
      const { 1: test, 2: tests, index } = <{ 1: string | null; 2: string | null; index: number }>(<unknown>match);
      let lineNumber = this.lineIndexForCharIndex(index);
      const block = this.blockAtCharIndex(index) || this.block;
      if (test) {
        this.tests.push({
          line: lineNumber,
          block,
          description: test,
        });
      }
      if (tests) {
        for (const line of tests.split("\n")) {
          const match = /^\s*\/\/\/?\s*(.*?)\s*$/.exec(line);
          if (match) {
            this.tests.push({
              line: lineNumber,
              block,
              description: match[1],
            });
          }
          lineNumber++;
        }
      }
    }*/
  }
}
