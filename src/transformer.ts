import * as ts from 'typescript';
const { JsxOpeningElement, JsxSelfClosingElement, JsxClosingElement ,JsxAttribute, JsxExpression, StringLiteral, NoSubstitutionTemplateLiteral, TemplateExpression } = ts.SyntaxKind;

export interface Options {
  flag?: string;
};

const defaultOptions: Options = {
  flag: '&'
};

type ExpectClassValue = ts.JsxExpression | ts.StringLiteral;

function hasClassAttrName(attr: ts.JsxAttributeLike): boolean {
  return (attr.kind === JsxAttribute) && (attr.name.getText() === 'className');
}

function hasValidValue(attr: ts.JsxAttribute): boolean {
  return (attr.initializer !== undefined) && (attr.initializer!.kind === StringLiteral || (attr.initializer!.kind === JsxExpression && (attr.initializer as ts.JsxExpression).expression !== undefined))
}

function findExpectClassAttr(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): ts.JsxAttribute | null {
  const attributes = node.attributes.properties;
  // 使用普通 jsxattribute 声明并且值类型为 stringliteral 或者 jsxexpression 才视为有效 className
  const classAttr = attributes.find(attr => hasClassAttrName(attr) && hasValidValue(attr as ts.JsxAttribute));
  if (!classAttr) {
    return null;
  } else {
    return classAttr as ts.JsxAttribute;
  }
}

function matchAll(regexp: RegExp, text: string) {
  // 手工置零， 防止其他地方使用过
  regexp.lastIndex = 0;
  const matches = [];
  let match;
  while (match = regexp.exec(text)) {
    matches.push(match);
  }
  return matches;
}

export default function createTransformer(opts?: Options) {
  let { flag } = Object.assign({} , defaultOptions, opts);
  const flagRegexp = new RegExp(flag!, 'g');
  
  function hasFlagIn(classAttr: ts.JsxAttribute): boolean {
    const classValue = classAttr.initializer!;
    return classValue.kind === StringLiteral && flagRegexp.test(classValue.text);
  }

  function concatTemplate(oldTemplate: ts.TemplateExpression, className: string): ts.TemplateExpression {
    // 重新拼接模板字符串
    const parentHead = oldTemplate.head.text;
    const parentSpans = oldTemplate.templateSpans;
    const parentTail = parentSpans[parentSpans.length - 1].literal.text;
    const matches = matchAll(flagRegexp, className);
    let head: ts.TemplateHead;
    let spans: ts.TemplateSpan[] = [];
    let tail: ts.TemplateTail;
    matches.forEach((m, i) => {
      if (i === 0) {
        head = ts.createTemplateHead(className.slice(0, m.index) + parentHead);
      }
      const nextValue = matches[i + 1];
      let spanLiteral: ts.TemplateTail | ts.TemplateMiddle;
      // 最后一个 match 需要做特殊处理
      if (nextValue !== undefined) {
        spanLiteral = ts.createTemplateMiddle(parentTail + className.slice(m.index + flag!.length, nextValue.index));
      } else {
        spanLiteral = ts.createTemplateTail(parentTail + className.slice(m.index + flag!.length));
      }
      parentSpans.forEach((span, spanIndex) => {
        // 最后一个 span 需要连接字符串，其余 span 不需要动
        if (spanIndex === parentSpans.length - 1) {
          spans.push(ts.createTemplateSpan(span.expression, spanLiteral));
        } else {
          spans.push(ts.createTemplateSpan(span.expression, ts.createTemplateMiddle(span.literal.text)));
        }
      });
      // spans.push(span);
    });
    return ts.createTemplateExpression(head!, spans);
  }

  // 根据空格来分割模板字符串
  function splitTemplateSpans(spans: ts.NodeArray<ts.TemplateSpan>): ts.TemplateSpan[] {
    const newSpanList: ts.TemplateSpan[] = [];
    for (const span of spans) {
      const { expression, literal } = span;
      const spanText = literal.text;
      const spanCopy = ts.createTemplateSpan(expression, ts.createTemplateMiddle(spanText));
      newSpanList.push(spanCopy);
      if (spanText.includes(' ')) {
        const newSpanText = spanText.split(' ')[0];
        spanCopy.literal = ts.createTemplateTail(newSpanText);
        break;
      }
    }
    return newSpanList;
  }


  // 构造新值，根据parentValue 有字符串和模板字符串两种形式
  function createNewClassValue(parentValue: ExpectClassValue, currentClass: string): ExpectClassValue {
    if (parentValue.kind === StringLiteral) {
      const newValueText = currentClass.replace(flagRegexp, parentValue.text.split(' ')[0]);
      return ts.createLiteral(newValueText);
    } 
    if(parentValue.expression!.kind === NoSubstitutionTemplateLiteral) {
      // NoSubstitutionTemplateLiteral 视为字符串处理
      return createNewClassValue(ts.createLiteral((parentValue.expression! as ts.NoSubstitutionTemplateLiteral).text), currentClass);
    }

    let expression = parentValue.expression!;
    // 如果不是 TemplateExpression, 则需要包装成 TemplateExpression
    if (expression.kind !== TemplateExpression) {
      expression = ts.createTemplateExpression(ts.createTemplateHead(''), [ts.createTemplateSpan(expression, ts.createTemplateTail(''))]);
    } else {
      // 如果是 TemplateExpression，则尝试进行进行分割, 分割可能得到 string 或 templateExpression;
      const { head, templateSpans } = expression as ts.TemplateExpression;
      if (head.text.includes(' ')) {
        return createNewClassValue(ts.createLiteral(head.text.split(' ')[0]), currentClass);
      }
      expression = ts.createTemplateExpression(head, splitTemplateSpans(templateSpans));
    }
    const newTemplate = concatTemplate(expression as ts.TemplateExpression, currentClass);
    return ts.createJsxExpression(undefined, newTemplate);
  }

  const transformer: ts.TransformerFactory<ts.SourceFile> = (ctx) => {
    const classValueStack: ExpectClassValue[] = [];
    let index = -1;
    const visitor: ts.Visitor = (node) => {
      switch (node.kind) {
        case JsxOpeningElement:
          const classAttr = findExpectClassAttr(<ts.JsxSelfClosingElement>node);
          if (classAttr) {
            if (hasFlagIn(classAttr) && index > -1) {
              // 转换
              classAttr.initializer = createNewClassValue(classValueStack[index], (classAttr.initializer as ts.StringLiteral).text);
            }            
            classValueStack.push(classAttr.initializer!);
          } else {
            classValueStack.push(classValueStack[index]);
          }
          index++;
          break;
        case JsxSelfClosingElement: {
          const classAttr = findExpectClassAttr(<ts.JsxSelfClosingElement>node);
          if (classAttr && hasFlagIn(classAttr) && index > -1) {
            classAttr.initializer = createNewClassValue(classValueStack[index], (classAttr.initializer as ts.StringLiteral).text);
          }
          return node;
        }    
        case JsxClosingElement: {
          classValueStack.pop();
          index--;
          return node;
        }
        default:
          break;
      }
      return ts.visitEachChild(node, visitor, ctx);
    }
    
    return source => ts.visitEachChild(source, visitor, ctx);
  }
  
  return transformer;
}
