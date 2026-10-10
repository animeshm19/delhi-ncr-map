import Logo from "./Logo";
import { SITE_NAME } from "@/lib/site";

/** "Delhi Tech Map" with the mark; letters rise in one by one, all in one colour. */
export default function Wordmark({ as: Tag = "h1" }: { as?: "h1" | "span" }) {
  let i = 0;
  return (
    <Tag className="wordmark" aria-label={SITE_NAME}>
      <Logo size={32} className="brand-mark" />
      <span aria-hidden className="wm-text">
        {SITE_NAME.split(" ").map((word) => (
          <span key={word} className="wm-word">
            {[...word].map((ch) => (
              <span key={i} className="wm-ch" style={{ animationDelay: `${120 + 35 * i++}ms` }}>{ch}</span>
            ))}
          </span>
        ))}
      </span>
    </Tag>
  );
}
