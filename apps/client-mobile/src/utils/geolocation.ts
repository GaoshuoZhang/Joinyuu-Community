/** geolocation 封装：Promise 化 + 降级重试 + 按错误码给出可操作提示。 */

export interface GeoPosition {
  lat: number
  lng: number
}

/** 单次定位：保留原始错误码，便于区分「被拒 / 不可用 / 超时」 */
function requestOnce(options: PositionOptions): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      options,
    )
  })
}

/* GeolocationPositionError.code：1=PERMISSION_DENIED 2=POSITION_UNAVAILABLE 3=TIMEOUT。
 * 旧实现把所有失败都报成「权限未授权」，授权正常但超时/系统定位服务未开时严重误导。 */
function describeError(error: unknown): string {
  const code = (error as GeolocationPositionError | undefined)?.code
  if (code === 1) return '浏览器拒绝了定位授权：请点击地址栏左侧的站点设置，将「位置」改为允许；若页面被嵌入其他窗口，请用浏览器直接打开后重试'
  if (code === 2) return '无法获取位置信息，请确认设备定位服务已开启后重试'
  if (code === 3) return '定位超时，请移至信号较好的位置后重试'
  return '定位失败，请稍后重试'
}

/** 获取当前位置：先高精度（8 秒），超时/不可用时降级为低精度（网络定位、允许缓存）重试一次；
 * 权限被拒绝时无需重试。两次均失败才按最终错误码抛出可操作提示。 */
export async function getPosition(): Promise<GeoPosition> {
  if (!navigator.geolocation) throw new Error('当前浏览器不支持定位')
  /* 非安全环境（http + 非 localhost，如局域网 IP）下浏览器不弹授权框、直接拒绝定位；
   * 若不提前拦截，用户只看到「权限被拒绝」，会误以为是浏览器设置没开。 */
  if (window.isSecureContext === false) {
    throw new Error('当前地址不是安全环境（需 HTTPS 或 localhost），浏览器会直接拒绝定位；请改用 https 或 http://localhost 打开后重试')
  }
  try {
    return await requestOnce({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 })
  } catch (error) {
    if ((error as GeolocationPositionError | undefined)?.code === 1) throw new Error(describeError(error))
    try {
      return await requestOnce({ enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 })
    } catch (fallbackError) {
      throw new Error(describeError(fallbackError))
    }
  }
}
