import { describe, expect, it } from "vitest";
import { cleanPlainText } from "../lib/text";
import { canonicalDouyinUrl, canonicalHttpUrl, extractDouyinUrls, extractShare, parseAccountHomepage } from "../lib/url";

const USER = "https://www.douyin.com/user/MS4wLjABAAAAAKVoSTXiyQHzLWpX9vVZ-DhEGeB_lM6A325fijkZw3wLOqr9dC9QzRCqrE66UDjV";

describe("抖音链接", () => {
  it("接受真实主页、搜索页、短链和 iesdouyin", () => {
    expect(parseAccountHomepage(USER)?.kind).toBe("user");
    expect(parseAccountHomepage(" https://www.douyin.com/search/热心市民杨生 ")?.kind).toBe("search");
    expect(parseAccountHomepage("http://douyin.com/search/foo")?.href).toBe("https://douyin.com/search/foo");
    expect(canonicalDouyinUrl("https://v.douyin.com/iAbCdEf/")).toBe("https://v.douyin.com/iAbCdEf");
    expect(canonicalDouyinUrl("https://www.iesdouyin.com/share/video/123/")?.includes("iesdouyin.com")).toBe(true);
    expect(canonicalDouyinUrl("https://www.douyin.com:443/user/abc")).toBe("https://www.douyin.com/user/abc");
  });

  it("拒绝协议、仿冒域名、子串和账号口令", () => {
    const rejected = [
      "javascript:alert(1)",
      "data:text/html,hi",
      "ftp://www.douyin.com/user/x",
      "https://evil.com/?u=https://www.douyin.com/user/x",
      "https://www.douyin.com.evil.com/user/x",
      "https://notdouyin.com/user/x",
      "https://douyin.com.evil.com/user/x",
      "https://evil-douyin.com/user/x",
      "https://user:pass@www.douyin.com/user/abc",
      "https://www.douyin.com@evil.com/user/abc",
      "https://douyin.com%2eevil.com/user/a",
      "https://www.d\u043euyin.com/user/a",
      "https://www.douyin.com:444/user/x",
      "//www.douyin.com/user/x",
      "https://www.douyin.com/user/x y",
    ];
    for (const input of rejected) {
      expect(canonicalDouyinUrl(input), input).toBeNull();
    }
    expect(parseAccountHomepage("https://v.douyin.com/iAbCdEf")).toBeNull();
  });

  it("从分享文案提取第一个合法链接，并跳过仿冒链接", () => {
    const text = "7.58 复制打开抖音，看看【站立起来的影子的作品】以后就幸福了 https://evil.com/douyin.com/video/1 https://v.douyin.com/abcDEF12/ 复制";
    const extracted = extractShare(text);
    expect(extracted.url).toBe("https://v.douyin.com/abcDEF12");
    expect(extracted.author).toBe("站立起来的影子");
    expect(extracted.title).toBe("以后就幸福了");
    expect(extractDouyinUrls("只有 https://notdouyin.com/douyin.com")).toEqual([]);
    expect(extractShare("【不是作者】 https://www.douyin.com/video/99").author).toBe("");
  });

  it("普通外链只允许 http/https，抖音字段不会放开", () => {
    expect(canonicalHttpUrl("https://cursor.com/canvas/demo")).toBe("https://cursor.com/canvas/demo");
    expect(canonicalHttpUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalHttpUrl("https://user:pass@cursor.com/a")).toBeNull();
  });

  it("文本清理保留尖括号，不把它们当成可执行标记", () => {
    expect(cleanPlainText("  <script>alert(1)</script>  ", 80)).toBe("<script>alert(1)</script>");
    expect(cleanPlainText("<img src=x onerror=alert(1)>", 80)).toBe("<img src=x onerror=alert(1)>");
  });
});
