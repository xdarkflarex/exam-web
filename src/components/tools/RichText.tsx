import { Fragment } from 'react'

/**
 * Hiển thị chuỗi lời giải của công cụ:
 *   `$$…$$` công thức riêng dòng (cuộn ngang được khi dài hơn màn hình),
 *   `$…$`   công thức trong dòng,
 *   `**…**` chữ đậm.
 * Cố ý không dùng Markdown: `d_1` trong công thức sẽ bị Markdown đọc thành chữ
 * nghiêng — xem `lib/tools/inequality-region/steps.ts`.
 *
 * Phải nằm TRONG một `<MathJax>` thì phần công thức mới được dựng.
 */
export default function RichText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$]+\$|\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          // Dùng \[ \] thay cho $$: MathJax dựng thành khối, và globals.css cho
          // `mjx-container[display="true"]` cuộn ngang thay vì đẩy trang tràn.
          return (
            <span key={i} className="block max-w-full py-1">
              {`\\[${part.slice(2, -2)}\\]`}
            </span>
          )
        }
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
