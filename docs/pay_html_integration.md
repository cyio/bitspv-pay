# `pay.html` 通用支付代理接入和使用文档

`pay.html` 文件被设计为一个通用的支付代理页面，用于处理比特币SV (BSV) 的支付流程。它可以在独立的窗口中打开，或者通过重定向的方式集成到您的应用中，以简化支付调用和结果处理。

## 1. 接入 `pay.html`

将 `pay.html` 文件及其相关的资源（例如，打包后的 JavaScript 文件 `/src/pages/pay/main.js` 及其依赖）放置在您的项目可以通过 HTTP 访问的路径下。通常，您可以将其放在项目的根目录或 `public` 目录下。

确保 `pay.html` 中引用的脚本路径正确，例如：

```html
<script type="module" src="/src/pages/pay/main.js"></script>
```

这里的 `/src/pages/pay/main.js` 路径需要根据您的项目结构进行调整，确保浏览器能够正确加载。

## 2. 调用 `pay.html` 进行支付

您可以通过两种方式调用 `pay.html`：

### 方式一：通过 `window.open` 在新窗口中打开

这种方式适用于桌面端或非微信环境，可以在不中断当前页面的情况下完成支付流程。

```javascript
function callPay(paymentParams) {
  // 将支付参数编码后放入哈希
  const encodedData = encodeURIComponent(JSON.stringify(paymentParams));
  let childWindow = window.open(
    `https://pay.bitspv.com/#${encodedData}`, // 使用 # 传递数据
    'Payment',
    'width=500,height=580' // 可选：设置窗口大小
  );
  // 设置一个全局函数供子窗口调用回调
  window.receiveDataFromChild = receiveDataFromChild;
  // 建立父子窗口关系，确保回调正常工作
  childWindow.opener = window;
}

// 在父窗口中定义回调函数
const receiveDataFromChild = data => {
  console.log('接收到来自子窗口的数据：', data);
  if (data) {
    // 处理支付成功后的数据，例如交易ID (txid)
    handlePayResult(data);
  }
};

// 处理支付结果的函数
function handlePayResult(txid) {
  // 根据 txid 更新UI或进行其他操作
  console.log('支付成功，交易ID:', txid);
  // ...
}
```

**说明：**
- `paymentParams` 是一个包含支付详情的数组，将在下一节详细说明。
- 支付参数通过 URL 的哈希部分 (`#${encodedData}`) 传递给 `pay.html`。
- 在父窗口定义 `receiveDataFromChild` 函数，并在 `window` 对象上暴露，供 `pay.html` 调用。
- `childWindow.opener = window;` 确保父子窗口之间的通信权限。

### 方式二：通过重定向跳转到 `pay.html`

这种方式适用于移动端或微信环境，会直接跳转到 `pay.html` 页面进行支付。

```javascript
function redirectToPay(paymentParams) {
  // 将支付参数编码后放入哈希
  const encodedData = encodeURIComponent(JSON.stringify(paymentParams));
  // 保留原有的查询参数，将数据放入哈希
  const callbackUrl = encodeURIComponent(window.location.href); // 当前页面的URL作为回调地址
  window.location.href = `https://pay.bitspv.com/?mode=redirect&callbackUrl=${callbackUrl}#${encodedData}`;
}

// 在原页面加载时处理回调
function handlePaymentCallback() {
  const { status, data, ...remainingQuery } = route.query; // 假设使用 Vue Router
  if (data) {
    // 处理支付成功后的数据，例如交易ID (txid)
    handlePayResult(data);
    // 清除URL中的支付回调参数
    router.replace({
      path: route.path,
      query: remainingQuery,
    });
  }
}

// 在页面加载时调用 handlePaymentCallback
onMounted(() => {
  handlePaymentCallback();
});

// 处理支付结果的函数
function handlePayResult(txid) {
  // 根据 txid 更新UI或进行其他操作
  console.log('支付成功，交易ID:', txid);
  // ...
}
```

**说明：**
- `paymentParams` 同样通过 URL 的哈希部分传递。
- 当前页面的完整 URL (`window.location.href`) 作为 `callbackUrl` 通过查询参数传递给 `pay.html`。
- `pay.html` 完成支付后，会重定向回 `callbackUrl`，并将支付结果（例如 `txid`）作为查询参数 (`data`) 添加到 URL 中。
- 在原页面加载时，通过检查 URL 查询参数来获取支付结果并进行处理。

## 3. `paymentParams` 结构

`paymentParams` 是一个数组，每个元素代表一个支付输出。通常包含至少两个元素：一个用于数据输出（OP_RETURN），一个用于接收找零或支付给指定地址。

```javascript
const paymentParams = [
  {
    data: bData.map(d => Buffer.from(d).toString('hex')), // 数据输出，需要是十六进制字符串数组
    satoshis: 0, // 数据输出的 satoshis 通常为 0
  },
  {
    address: business.receiveAddress, // 接收找零或支付的地址
    satoshis: 1000, // 支付的 satoshis 数量
  },
  // ... 可以有更多输出
];
```

**说明：**
- `data`: 包含要写入区块链的数据，每个元素是一个 Buffer 转换成的十六进制字符串。例如，用于 B 协议的数据通常以 `19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut` 开头。
- `satoshis`: 该输出对应的 satoshis 数量。数据输出通常为 0，支付地址输出为实际支付金额。
- `address`: 接收支付的比特币SV地址。

## 4. 支付结果回调处理

### `window.open` 方式

`pay.html` 在支付成功后，会调用父窗口的 `window.opener.receiveDataFromChild(txid)` 函数，将交易ID (`txid`) 作为参数传递。您需要在父窗口中实现 `receiveDataFromChild` 函数来接收和处理这个 `txid`。

### 重定向方式

`pay.html` 在支付成功后，会重定向回 `callbackUrl`，并在 URL 中添加 `data=txid` 查询参数。您需要在 `callbackUrl` 对应的页面加载时，检查 URL 查询参数，获取 `data` 的值（即 `txid`），并进行处理。

## 5. 错误处理

如果在支付过程中发生错误，`pay.html` 可能会通过以下方式通知调用方：

- **`window.open` 方式:** 可能会调用父窗口的某个错误处理函数（如果定义了），或者在子窗口中显示错误信息。
- **重定向方式:** 可能会重定向回 `callbackUrl` 并添加错误相关的查询参数（例如 `status=error&errorMessage=...`）。

您需要在调用方根据具体情况实现相应的错误处理逻辑，例如显示错误提示给用户。

## 6. 示例代码参考

您可以参考`PublishOnBlockchain.vue`文件中的 `sendMesaage`、`callPay`、`redirectToPay` 和 `handlePaymentCallback` 函数的实现，了解如何在实际应用中调用 `pay.html` 并处理回调。

请注意，`pay.html` 内部的具体实现（例如如何与钱包交互、构建交易等）不属于本文档的范围，本文档主要关注如何从外部接入和使用 `pay.html` 作为支付代理。
