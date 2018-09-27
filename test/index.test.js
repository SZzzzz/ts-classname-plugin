const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const transformerFactory = require('../lib/transformer').default;
const printer = ts.createPrinter();
const defaultTransformer = transformerFactory();

function transform(sourcePath, transformer = defaultTransformer) {
  const sourceText = fs.readFileSync(sourcePath).toString();
  const source = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.ES2016, true);
  const result = ts.transform(source, [ transformer ]);
  const transformedSourceFile = result.transformed[0];
  const resultCode = printer.printFile(transformedSourceFile);
  return resultCode;
}
const casesDir = path.resolve(__dirname, 'fixtures');
const cases = fs.readdirSync(casesDir);

describe('should compile', () => { 
  cases.forEach(dir => {
    const sourceFile = path.resolve(casesDir, dir, 'source.tsx');
    const expectFile = path.resolve(casesDir, dir, 'expect.tsx');
    const expextText = fs.readFileSync(expectFile).toString();
    const result = transform(sourceFile);
    it(`test ${dir}`, () => {
      expect(result).to.equal(expextText);
    })
  });
});