import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * 把子树挂到 document.body 末尾。
 *
 * 存在的理由：Radix 的 Dialog / Sheet 都是 portal，节点插在 #root 之后且同为
 * z-50。任何在组件树里原地渲染的 `fixed` 浮层都会被压在它们下面，同时被它们
 * 的焦点锁挡住——表现为「点了没反应」。同理，Radix Sheet 上的 transform 会让
 * 后代 `fixed inset-0` 以 Sheet 为包含块，全屏预览被裁在抽屉里。
 *
 * 所以自定义浮层必须走 portal，并且层级要高于 Radix（z-[60]）。
 */
export default function Portal({ children }) {
  return createPortal(children, document.body);
}

/** 打开浮层时锁住背景滚动。 */
export function useLockBodyScroll(active) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
