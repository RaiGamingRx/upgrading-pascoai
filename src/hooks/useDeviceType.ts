import { useMediaQuery } from "./useMediaQuery";

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isLaptop: boolean;
  isDesktop: boolean;
  isTouch: boolean;
}

export function useDeviceType(): DeviceInfo {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const isTablet = useMediaQuery("(min-width: 640px) and (max-width: 1023px)");
  const isLaptop = useMediaQuery("(min-width: 1024px) and (max-width: 1279px)");
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const isTouch = useMediaQuery("(pointer: coarse)");

  return {
    isMobile,
    isTablet,
    isLaptop,
    isDesktop,
    isTouch,
  };
}
