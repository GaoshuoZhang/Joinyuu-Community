/** geolocation 封装：Promise 化 + devtools 模拟位置注入点（[MOCK-ONLY]）。 */

interface InjectedPosition {
  lat: number
  lng: number
}

declare global {
  interface Window {
    /** [MOCK-ONLY] devtools 注入的模拟位置（存在时优先于真实定位） */
    __mockGeolocation?: InjectedPosition | 'denied'
  }
}

export interface GeoPosition {
  lat: number
  lng: number
}

export function getPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    const injected = window.__mockGeolocation
    if (injected === 'denied') {
      reject(new Error('定位权限未授权，请在浏览器设置中允许定位后重试'))
      return
    }
    if (injected) {
      resolve({ lat: injected.lat, lng: injected.lng })
      return
    }
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('定位失败或权限未授权，请检查浏览器定位设置')),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}
