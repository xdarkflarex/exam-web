import { Fragment } from 'react'

/**
 * Hiển thị chuỗi lời giải của công cụ: `$…$` là công thức (để MathJax bao
 * ngoài typeset), `**…**` là chữ đậm. Cố ý không dùng Markdown: `d_1` trong
 * công thức sẽ bị Markdown đọc thành chữ nghiêng — xem `steps.ts`.
 *
 * Phải nằm TRONG một `<MathJax>` thì phần công thức mới được dựng.
 */
export default function RichText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$|\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-slate-900 dark:text-white">
              <RichText text={part.slice(2, -2)} />
            </strong>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}
