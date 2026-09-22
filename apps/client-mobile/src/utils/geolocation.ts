/** geolocation 封装：Promise 化 + 超时/权限错误提示。 */

export interface GeoPosition {
  lat: number
  lng: number
}

export function getPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
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
