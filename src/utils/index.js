export const isDev = location.port !== '';

export function downloadImage(url, filename = 'download.png') {
  if (!url) {
    console.error('url is blank: ', url);
    return;
  }
  // 创建一个新的 a 元素
  const a = document.createElement('a');

  // 将 a 元素的 href 属性设置为图片的 URL
  a.href = url;

  // 将 a 元素的 download 属性设置为图片的文件名
  a.download = filename;

  // 将 a 元素添加到文档中
  document.body.appendChild(a);

  // 模拟点击 a 元素
  a.click();

  // 从文档中删除 a 元素
  document.body.removeChild(a);
}

export const limitSize = 500;

export async function compressCanvasAndRender(inputCanvas, outputCanvas) {
  //获取 offscreen canvas 的图像
  const imgBitmap = await inputCanvas.transferToImageBitmap();

  // 计算比例
  let ratio = 1;
  if (imgBitmap.width > limitSize || imgBitmap.height > limitSize) {
    ratio =
      imgBitmap.width > imgBitmap.height
        ? imgBitmap.width / limitSize
        : imgBitmap.height / limitSize;
  }

  // 设置 canvas 大小
  outputCanvas.width = imgBitmap.width / ratio;
  outputCanvas.height = imgBitmap.height / ratio;

  // 获取屏幕上的 canvas 元素
  const resultCanvasRenderer = outputCanvas.getContext('2d');
  // 绘制 resize 后的图像到屏幕上的 canvas
  resultCanvasRenderer.drawImage(
    imgBitmap,
    0,
    0,
    imgBitmap.width / ratio,
    imgBitmap.height / ratio
  );

  return { ratio };
}

function isDesktopFunc() {
  const userAgent = navigator.userAgent.toLowerCase();
  // 常见移动端设备关键字
  const mobileKeywords = ['android', 'iphone', 'ipad', 'ipod', 'windows phone'];
  return !mobileKeywords.some(keyword => userAgent.includes(keyword));
}

function isWeChatFunc() {
  return /MicroMessenger/i.test(navigator.userAgent);
}

export const isDesktop = isDesktopFunc();
export const isWeChat = isWeChatFunc();
