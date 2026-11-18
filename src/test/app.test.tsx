import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { STORAGE_KEY } from "../lib/storage";
import { createSeedState } from "../lib/seed";
import { memoryStorage } from "./helpers";

describe("界面", () => {
  it("展示预载账号、搜索入口和本机保存说明", () => {
    render(<App storage={memoryStorage()} />);
    expect(screen.getByRole("heading", { name: "不吃榨菜AIGC" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "别闹了豆刨" })).toBeInTheDocument();
    expect(screen.getAllByText("不是已核实的作者主页")).toHaveLength(5);
    expect(screen.getByText(/0 条收藏/)).toBeInTheDocument();
    expect(screen.getByText(/仅保存在当前浏览器/)).toBeInTheDocument();
    expect(screen.getByText(/不会自动种回去/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "打开主页：白袋子" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.getAttribute("href")).toMatch(/^https:\/\/www\.douyin\.com\/user\//);
    const search = screen.getByRole("link", { name: "打开搜索：Mx-Shell" });
    expect(search.getAttribute("href")).toMatch(/^https:\/\/www\.douyin\.com\/search\//);
  });

  it("账号名称里的 HTML 只作为文本", () => {
    const storage = memoryStorage();
    const state = createSeedState();
    const first = state.accounts[0];
    if (!first) throw new Error("missing seed");
    state.accounts[0] = { ...first, name: "<img src=x onerror=alert(1)>" };
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App storage={storage} />);
    const heading = screen.getByRole("heading", { name: "<img src=x onerror=alert(1)>" });
    expect(heading.textContent).toContain("<img");
    expect(heading.innerHTML).not.toContain("<img");
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("拒绝把仿冒链接保存成账号", () => {
    render(<App storage={memoryStorage()} />);
    fireEvent.click(screen.getByRole("button", { name: "新增账号" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "坏链接" } });
    fireEvent.change(screen.getByLabelText("主页链接"), { target: { value: "https://evil.com/douyin.com/user/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "保存账号" }));
    expect(screen.getByRole("alert")).toHaveTextContent("douyin.com");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("heading", { name: "坏链接" })).not.toBeInTheDocument();
  });

  it("收藏可增改筛选，删除账号后仍在，刷新也不种回账号", async () => {
    const storage = memoryStorage();
    const first = render(<App storage={storage} />);
    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));
    fireEvent.change(screen.getByLabelText("分享文案或链接"), {
      target: { value: "3.21 复制打开抖音，看看【独立作者的作品】手动样例 https://v.douyin.com/manualDemo1/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提取链接" }));
    expect(screen.getByLabelText("作品链接")).toHaveValue("https://v.douyin.com/manualDemo1");
    expect(screen.getByLabelText("标题")).toHaveValue("手动样例");
    const accountSelect = screen.getByLabelText("关联账号");
    const accountOption = screen.getByRole("option", { name: "不吃榨菜AIGC" });
    fireEvent.change(accountSelect, { target: { value: accountOption.getAttribute("value") } });
    fireEvent.change(screen.getByLabelText("收藏标签"), { target: { value: "镜头参考" } });
    fireEvent.change(screen.getByLabelText("笔记"), { target: { value: "只是笔记" } });
    fireEvent.click(screen.getByRole("button", { name: "3 星" }));
    fireEvent.click(screen.getByRole("button", { name: "保存收藏" }));
    expect(screen.getByRole("heading", { name: "手动样例" })).toBeInTheDocument();
    expect(screen.getByText("只是笔记")).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 5/)).toBeInTheDocument();
    expect(screen.getByText("镜头参考")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "已看" }));
    expect(screen.queryByRole("heading", { name: "手动样例" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "待看" }));
    fireEvent.change(screen.getByLabelText("搜索收藏"), { target: { value: "只是笔记" } });
    expect(screen.getByRole("heading", { name: "手动样例" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("搜索收藏"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "全部状态" }));

    fireEvent.click(screen.getByRole("button", { name: "编辑手动样例" }));
    fireEvent.change(screen.getByLabelText("笔记"), { target: { value: "改过的笔记" } });
    fireEvent.click(screen.getByRole("radio", { name: "重点参考" }));
    fireEvent.click(screen.getByRole("button", { name: "保存收藏" }));
    expect(screen.getByText("改过的笔记")).toBeInTheDocument();
    expect(screen.getByLabelText("手动样例的观看状态")).toHaveValue("reference");

    const workLink = screen.getByRole("link", { name: "在抖音打开：手动样例" });
    expect(workLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(workLink).toHaveAttribute("href", "https://v.douyin.com/manualDemo1");

    fireEvent.click(screen.getByRole("tab", { name: "账号" }));
    fireEvent.click(screen.getByRole("button", { name: "删除不吃榨菜AIGC" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("会保留");
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.queryByRole("heading", { name: "不吃榨菜AIGC" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));
    expect(screen.getByRole("heading", { name: "手动样例" })).toBeInTheDocument();

    first.unmount();
    render(<App storage={storage} />);
    expect(screen.queryByRole("heading", { name: "不吃榨菜AIGC" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "白袋子" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));
    expect(screen.getByRole("heading", { name: "手动样例" })).toBeInTheDocument();
    expect(screen.getByText("改过的笔记")).toBeInTheDocument();
  });

  it("可以撤销删除，也可以合并导入且不制造收藏", async () => {
    const storage = memoryStorage();
    render(<App storage={storage} />);
    fireEvent.click(screen.getByRole("button", { name: "删除白袋子" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.queryByRole("heading", { name: "白袋子" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.getByRole("heading", { name: "白袋子" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "备份" }));
    const raw = JSON.stringify({
      sourceTitle: "外来清单",
      notes: "只有账号",
      accounts: [
        {
          name: "导入的新账号",
          homepage: "https://www.douyin.com/user/MS4wIMPORTED",
          track: "观察",
          batch: "五批",
          note: "《这不是已收藏视频》",
          homepageKind: "user",
        },
      ],
    });
    const file = new File([raw], "extra.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("选择 JSON 文件"), { target: { files: [file] } });
    expect(await screen.findByText(/将新增账号 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认合并导入" }));
    fireEvent.click(screen.getByRole("tab", { name: "账号" }));
    expect(screen.getByRole("heading", { name: "导入的新账号" })).toBeInTheDocument();
    expect(screen.getByText("《这不是已收藏视频》")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));
    expect(screen.getByText("还没有收藏作品")).toBeInTheDocument();
  });

  it("损坏数据时停止写入", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "{" });
    render(<App storage={storage} />);
    expect(screen.getByRole("heading", { name: "本地数据无法解析" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "不吃榨菜AIGC" })).not.toBeInTheDocument();
    expect(storage.getItem(STORAGE_KEY)).toBe("{");
    fireEvent.click(screen.getByRole("button", { name: "重置为 40 个已锁账号" }));
    expect(screen.getByRole("heading", { name: "不吃榨菜AIGC" })).toBeInTheDocument();
    expect(storage.getItem(STORAGE_KEY)).not.toBe("{");
  });
});
