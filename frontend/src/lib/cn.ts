/** 拼接 className，忽略 false / null / undefined */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
