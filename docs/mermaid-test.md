# Mermaid 测试文档

这是一个用来验证 MDEase 是否支持 mermaid 图表渲染的样例。

## 流程图

```mermaid
flowchart LR
    A[开始] --> B{是否登录?}
    B -- 是 --> C[进入主页]
    B -- 否 --> D[跳转登录页]
    D --> E[填写账号密码]
    E --> C
    C --> F[结束]
```

## 时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant B as 浏览器
    participant S as 服务器
    U->>B: 打开 .md 文件
    B->>B: MDEase 注入 content script
    B->>B: marked 解析 + mermaid 渲染
    B-->>U: 显示 WYSIWYG 视图
```

## 类图

```mermaid
classDiagram
    class State {
        +string filePath
        +string currentContent
        +string mode
        +boolean wysiwygDirty
    }
    class TurndownService {
        +turndown(html) string
    }
    State --> TurndownService : 在保存草稿时调用
```

## 普通代码块（不应被 mermaid 处理）

```js
const x = 1;
console.log('hello');
```

## 普通文字段落

下面是一段普通的中文，用来确认非图表内容不受影响。

- 列表项一
- 列表项二
- 列表项三
