<template>
  <div>
    <slot name="trigger" :scan="scanQRCode">
      <button @click="scanQRCode" class="p-4 m-2 w-full">扫一扫</button>
    </slot>
    
    <div v-if="showPreview" class="fixed inset-0 z-50 bg-black bg-opacity-80">
      <button 
        @click="stopScanning"
        class="z-50 absolute top-4 right-4 text-white text-xl bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70"
      >
        ×
      </button>
      <video ref="videoRef" class="w-full h-full object-cover"></video>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue';
import jsQR from 'jsqr';

const emit = defineEmits(['scan-result']);
const videoRef = ref(null);
const showPreview = ref(false);
let stream = null;
let scanInterval = null;

async function scanQRCode() {
  if (!navigator.mediaDevices?.getUserMedia) {
    emit('scan-result', { error: '您的浏览器不支持扫码功能' });
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } 
    });
    
    showPreview.value = true;
    await nextTick();
    
    videoRef.value.srcObject = stream;
    videoRef.value.play();
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    scanInterval = setInterval(() => {
      canvas.width = videoRef.value.videoWidth;
      canvas.height = videoRef.value.videoHeight;
      ctx.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height);
      
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code) {
          stopScanning();
          emit('scan-result', { data: code.data });
        }
      } catch (error) {
        // 忽略解码错误
      }
    }, 500);
  } catch (error) {
    emit('scan-result', { 
      error: `无法访问摄像头: ${error.message}` 
    });
  }
}

function stopScanning() {
  if (scanInterval) clearInterval(scanInterval);
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  showPreview.value = false;
}

defineExpose({
  scanQRCode,
  stopScanning
});
</script>