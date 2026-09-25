// Camera analysis is unmirrored; the performance view mirrors x exactly once.
export function displayRect(geometry, videoRect) {
  return {
    x: videoRect.x + (1 - geometry.x - geometry.width) * videoRect.w,
    y: videoRect.y + geometry.y * videoRect.h,
    w: geometry.width * videoRect.w,
    h: geometry.height * videoRect.h,
  }
}
