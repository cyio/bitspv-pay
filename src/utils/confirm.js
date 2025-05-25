import { createApp, h, ref, watch, Fragment, onMounted } from 'vue';
import Modal from '@/components/Modal.vue'; // 确保路径正确
import i18n from '@/i18n'; // 导入主应用的 i18n 实例

const { t } = i18n.global;

export function showConfirmationDialog( // Renamed from showConfirmation
  message,
  title = t('dialog.confirmOperation'),
  confirmButtonText = t('dialog.confirm'),
  cancelButtonText = t('dialog.cancel'),
  messageClass = '', // 新增参数，用于自定义消息文本样式
  showCancelButton = true // 新增参数，控制是否显示取消按钮
) {
  return new Promise((resolve) => {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);

    const app = createApp({
      setup() {
        const visible = ref(false); // 初始设置为 false
        onMounted(() => { // 在组件挂载后设置为 true
          visible.value = true;
        });

        const unmountApp = () => {
          app.unmount();
          if (mountEl.parentNode) {
            mountEl.parentNode.removeChild(mountEl);
          }
        };

        const handleConfirm = () => {
          if (visible.value) {
            visible.value = false;
            resolve(true);
          }
        };

        const handleCancel = () => {
          if (visible.value) {
            visible.value = false;
            resolve(false);
          }
        };

        // 监听 visible 变化，当 Modal 关闭时清理 DOM
        watch(visible, (newVal) => {
          if (!newVal) {
            // 使用 nextTick 或 setTimeout 确保 Vue 完成状态更新和可能的过渡效果
            setTimeout(unmountApp, 50); // 50ms 应该足够，Modal.vue 目前没有复杂过渡
          }
        });

        // Modal.vue 内部通过 'X' 按钮或点击遮罩层关闭时会触发 onClose
        const onCloseFromModal = () => {
          // 如果 Modal 因为 'X' 或遮罩层点击而关闭，视为取消操作
          handleCancel();
        };

        return () =>
          h(
            Modal,
            {
              visible: visible.value,
              title: title,
              modalClass: 'w-full max-w-sm', // 为确认弹窗设置一个合适的默认宽度
              hideFooter: false, // 我们需要显示页脚区域以放置自定义按钮
              onClose: onCloseFromModal, // 处理 Modal 组件自身的关闭事件
            },
            {
              // 默认插槽用于显示消息内容
              default: () => h('p', { class: `text-sm text-gray-700 dark:text-gray-300 py-3 ${messageClass}` }, message),
              // 页脚插槽用于放置确认和取消按钮
              footer: () => {
                const buttons = [];
                if (showCancelButton) {
                  buttons.push(
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600',
                        onClick: handleCancel,
                      },
                      cancelButtonText
                    )
                  );
                }
                buttons.push(
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500', // 主操作按钮样式
                      onClick: handleConfirm,
                    },
                    confirmButtonText
                  )
                );
                return h('div', { class: 'flex justify-end space-x-3 pt-3' }, buttons);
              },
            }
          );
      },
    });

    // 如果您的 Modal.vue 或其子组件依赖于 i18n 实例 (例如通过 useI18n)，
    // 并且这些 i18n 内容不是通过 props 传入的，您可能需要将主应用的 i18n 实例提供给这个动态创建的 app。
    // 例如: app.use(mainAppI18nInstance);
    // 当前 Modal.vue 的 i18n 用途主要在其默认的关闭按钮文字，我们通过自定义 footer 覆盖了它，
    // 其头部的 'X' 关闭按钮是 SVG 图标，不涉及 i18n。因此，这里暂时不需要特殊处理 i18n。

    app.use(i18n); // 注册 i18n 插件
    app.mount(mountEl);
  });
}

// 如何使用:
// import { showConfirmation } from '@/utils/confirm';
//
// async function handleDelete() {
//   try {
//     const confirmed = await showConfirmationDialog('您确定要删除这条记录吗?', '删除确认');
//     if (confirmed) {
//       console.log('用户确认删除');
//       // 执行删除操作
//     } else {
//       console.log('用户取消删除');
//     }
//   } catch (error) {
//     // Promise 在这里的设计是 resolve(false) 而不是 reject，所以 catch 不会被常规取消触发
//     // 但如果 showConfirmation 内部有未捕获的错误，这里可以捕获
//     console.error('确认弹窗出错:', error);
//   }
// }

export function showInfoDialog(
  title = t('dialog.tip'),
  message,
  buttonText = t('dialog.gotIt')
) {
  return new Promise((resolve) => {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);

    const app = createApp({
      setup() {
        const visible = ref(false); // 初始设置为 false
        onMounted(() => { // 在组件挂载后设置为 true
          visible.value = true;
        });

        const unmountApp = () => {
          app.unmount();
          if (mountEl.parentNode) {
            mountEl.parentNode.removeChild(mountEl);
          }
        };

        const handleClose = () => {
          if (visible.value) {
            visible.value = false;
            resolve(true); // 对于信息弹窗，关闭即认为是完成操作
          }
        };

        watch(visible, (newVal) => {
          if (!newVal) {
            setTimeout(unmountApp, 50);
          }
        });

        // Modal.vue 内部通过 'X' 按钮或点击遮罩层关闭时会触发 onClose
        const onCloseFromModal = () => {
          handleClose();
        };

        return () =>
          h(
            Modal,
            {
              visible: visible.value,
              title: title,
              modalClass: 'w-full max-w-sm',
              hideFooter: false,
              onClose: onCloseFromModal,
            },
            {
              default: () => h('p', { class: 'text-sm text-gray-700 dark:text-gray-300 py-3' }, message),
              footer: () =>
                h('div', { class: 'flex justify-end space-x-3 pt-3' }, [
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
                      onClick: handleClose,
                    },
                    buttonText
                  ),
                ]),
            }
          );
      },
    });

    app.use(i18n);
    app.mount(mountEl);
  });
}

export function showPromptDialog(
  title = t('dialog.pleaseInput'),
  message,
  confirmButtonText = t('dialog.confirm'),
  cancelButtonText = t('dialog.cancel'),
  inputType = 'text', // 'text', 'password', etc.
  inputPlaceholder = '',
  hintMessage = '', // 新增可选参数 hintMessage
  showCancelButton = true, // 新增参数，控制是否显示取消按钮
  hideModalHeaderCloseButton = false // 新增参数，控制是否显示 Modal 的头部关闭按钮
) {
  return new Promise((resolve) => {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);
    const inputValue = ref('');

    const app = createApp({
      setup() {
        const visible = ref(false); // 初始设置为 false
        onMounted(() => { // 在组件挂载后设置为 true
          visible.value = true;
        });

        const unmountApp = () => {
          app.unmount();
          if (mountEl.parentNode) {
            mountEl.parentNode.removeChild(mountEl);
          }
        };

        const handleConfirm = () => {
          if (visible.value) {
            visible.value = false;
            resolve(inputValue.value); // Resolve with the input value
          }
        };

        const handleCancel = () => {
          if (visible.value) {
            visible.value = false;
            resolve(null); // Resolve with null if cancelled
          }
        };

        watch(visible, (newVal) => {
          if (!newVal) {
            setTimeout(unmountApp, 50);
          }
        });

        const onCloseFromModal = () => {
          handleCancel();
        };

        return () =>
          h(
            Modal,
            {
              visible: visible.value,
              title: title,
              modalClass: 'w-full max-w-sm',
              hideFooter: false,
              onClose: onCloseFromModal,
              hideHeaderCloseButton: hideModalHeaderCloseButton, // Pass down the new prop
            },
            {
              default: () => {
                const inputEl = h('input', {
                  type: inputType,
                  value: inputValue.value,
                  onInput: (event) => (inputValue.value = event.target.value),
                  placeholder: inputPlaceholder,
                  class: 'mt-2 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm',
                  // autocomplete: inputType === 'password' ? 'new-password' : 'on', // 'on' allows normal autofill for non-password
                  // autofocus: true, // Removed autofocus, will be handled manually
                });

                const contentChildren = [
                  h('p', { class: 'text-sm text-gray-700 dark:text-gray-300 py-2' }, message),
                ];

                if (inputType === 'password') {
                  // Wrap password input in a form to isolate it for password managers
                  contentChildren.push(h('form', {
                    onSubmit: (event) => {
                      event.preventDefault();
                      handleConfirm();
                    }
                  }, [inputEl]));
                } else {
                  contentChildren.push(inputEl);
                }

                if (hintMessage) {
                  contentChildren.push(h('p', { class: 'text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2' }, hintMessage));
                }
                return h(Fragment, contentChildren);
              },
              footer: () => {
                const buttons = [];
                if (showCancelButton) {
                  buttons.push(
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600',
                        onClick: handleCancel,
                      },
                      cancelButtonText
                    )
                  );
                }
                buttons.push(
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
                      onClick: handleConfirm,
                    },
                    confirmButtonText
                  )
                );
                return h('div', { class: 'flex justify-end space-x-3 pt-3' }, buttons);
              },
            }
          );
      },
    });
    app.use(i18n);
    app.mount(mountEl);

    // Manually focus the input after a short delay to ensure the modal is rendered
    // and to avoid issues with existing focused elements.
    setTimeout(() => {
      const inputElement = mountEl.querySelector('input');
      if (inputElement) {
        inputElement.focus();
      }
    }, 100); // 100ms delay, adjust if necessary
  });
}
