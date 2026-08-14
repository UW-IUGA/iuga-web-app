import { CustomBehaviorOptions } from 'scroll-into-view-if-needed'
import { Options } from 'scroll-into-view-if-needed'
import { StandardBehaviorOptions } from 'scroll-into-view-if-needed'

export declare interface CustomEasing {
  (t: number): number
}

declare type OnScrollChangeCallback = (scrollState: {
  target: Element
  elapsed: number
  value: number
  left: number
  top: number
}) => void

declare function scroll_2(
  target: Element,
  options?: SmoothBehaviorOptions
): Promise<any>

declare function scroll_2<T>(
  target: Element,
  options: CustomBehaviorOptions<T>
): T

declare function scroll_2(
  target: Element,
  options: StandardBehaviorOptions
): void

export declare type SmoothBehaviorOptions = Options & {
  behavior?: 'smooth'
  duration?: number
  ease?: CustomEasing
  onScrollChange?: OnScrollChangeCallback
}

declare const smoothScrollIntoView: typeof scroll_2
export default smoothScrollIntoView

export {}
