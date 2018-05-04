import * as ts from 'typescript';

export interface Options {
  symbol?: string | RegExp;
};

const defaultOptions: Options = {
  symbol: '&'
};

export default function createTransformer(opts?: Options) {
  let { symbol } = Object.assign({} , defaultOptions, opts);
  if (typeof symbol === 'string') {
    symbol = new RegExp(symbol, 'g');
  }

  const transformer: ts.TransformerFactory<ts.SourceFile> = (ctx) => {
    const { JsxElement, JsxSelfClosingElement, JsxSpreadAttribute, JsxExpression, StringLiteral } = ts.SyntaxKind;
    const visitor: (parentClass: ts.StringLiteral | ts.JsxExpression) => ts.Visitor = (parentClass) => (node) => {
      if (JsxElement === node.kind || JsxSelfClosingElement === node.kind)  {
        let attributes; 
        if (node.kind === JsxElement) {
          attributes = (node as ts.JsxElement).openingElement.attributes.properties;
        } else {
          attributes = (node as ts.JsxSelfClosingElement).attributes.properties;
        }
        const classIndex = attributes.findIndex(attr => attr.kind !== JsxSpreadAttribute && attr.name.getText() === 'className' && attr.initializer !== undefined);
        let realClass: ts.StringLiteral | ts.JsxExpression = ts.createLiteral('');
        // 有设置 className 属性
        if (classIndex > -1) {
          const classAttr = attributes[classIndex] as ts.JsxAttribute;
          // classValue 会有 StringLiteral 和 JsxExpression 两种情形
          const classValue = classAttr.initializer!;
          // 只对字符串形式的 className 进行处理，parentClass 如果是字符串，则进行替换，如果是表达式，则转换成{parent + '-class'} 的形式
          if (classValue.kind === StringLiteral) {
            const currentClassText = (classAttr.initializer as ts.StringLiteral).text;
            if (parentClass.kind === StringLiteral) {
              const realClassText = currentClassText.replace(symbol!, (parentClass as ts.StringLiteral).text);
              realClass = classAttr.initializer = ts.createLiteral(realClassText);
            }
            if (parentClass.kind === JsxExpression) {
              // TODO
              realClass = classValue;
            }
          } else {
            realClass = classValue;
          }
        }        
        return ts.visitEachChild(node, visitor(realClass), ctx);
      } else {
        return ts.visitEachChild(node, visitor(ts.createLiteral('')), ctx);
      }
    };
    
    return source => ts.visitNode(source, visitor(ts.createLiteral('')));
  }
  return transformer;
}
