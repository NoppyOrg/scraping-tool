import puppeteer, { Browser } from "puppeteer";
import fs from "fs";

const URL = "https://guide.gcas.cloud.go.jp/"
const ExcludeURL1 = "https://guide.gcas.cloud.go.jp/privacy-policy/"
const ExcludeURL2 = "https://guide.gcas.cloud.go.jp/search/"
const MaxDepth = 3; // スクレイピングの深さ

interface File {
    name: string;
    href: string;
    type: string;
    comment?: string;
}


interface ScrapePage {
    title: string;
    href: string;
    type: string;
    children: (ScrapePage | File)[];
}

async function _Do_ScrapePage(browser: Browser, url: string, depth: number = 0): Promise<ScrapePage | File> {
    // 変数の初期化
    let ret: ScrapePage = {
        title: "",
        href: "",
        type: "tree",
        children: [],
    }

    // スクレーピング
    try {
        // ページを開く
        const page = await browser.newPage();
        await page.goto(url);

        // ページタイトルを取得
        // page.title()の文字列から最初の" | "以降を削除して、ret.titleに格納する
        const title = await page.title();
        const titleIndex = title.indexOf(" | ");
        if (titleIndex !== -1) {
            ret.title = title.substring(0, titleIndex);
        } else {
            ret.title = title;
        }
        ret.href = await page.url();

        // ハイパーリンクを収集して、hrefとtextContentを取得
        const elements = await page.$$eval('a', list => list.map(e => {
            const data = {
                textContent: (function (x) {
                    if (x === null) {
                        return [];
                    }
                    // 改行文字で分割し、前後の空白を削除して、空でない要素だけをフィルタリング
                    return x.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
                }(e.textContent)),
                href: e.href
            }
            return data;
        }));
        //console.log(elements);

        //ハイパーリンくのスクリーニング
        const screening = elements.filter(e =>
            e.href.includes(url) &&
            !e.href.includes("#") &&
            !e.href.includes("mailto:") &&
            e.href != url &&
            e.href != ExcludeURL1 &&
            e.href != ExcludeURL2
        );
        //console.log(screening);

        // screening.hrefがファイルかかそうでないかを判断し、ファイルならoutputに保存、それ以外なら再帰的にスクレイピング
        for (const e of screening) {
            const href = e.href;
            const textContent = e.textContent;
            // hrefがファイルかどうかを判断
            if (href.endsWith(".pdf") || href.endsWith(".docx") || href.endsWith(".xlsx") || href.endsWith(".pptx") || href.endsWith(".zip") || href.endsWith(".rar")) {
                // ファイルの保存処理をここに追加
                const file: File = {
                    name: textContent[0] || "ファイル名不明",
                    href: href,
                    type: href.split('.').pop() || "unknown",
                }
                ret.children.push(file);

            } else {
                if (depth >= MaxDepth) {
                    console.log(`最大深度に達しました: ${depth}`);
                    const file: File = {
                        name: textContent[0] || "ファイル名不明",
                        href: href,
                        type: "html",
                        comment: "最大深度に達しました",
                    }
                    ret.children.push(file);
                } else {
                    ret.children.push(await _Do_ScrapePage(browser, href, depth + 1));
                }
            }
        }

        await page.close();

    } catch (error) {
        console.error(`エラーが発生しました: ${error}`);
    }

    // スクレイピング結果を返す
    if (ret.children.length === 0) {
        const file: File = {
            name: ret.title || "ファイル名不明",
            href: ret.href,
            type: "html",
        }
        return file;
    } else {
        return ret;
    }

}

async function ScrapePage(url: string): Promise<ScrapePage | File> {
    // Puppeteerの起動
    const LAUNCH_OPTION = {
        headless: false, // ヘッドレスモードを有効にする
    };
    const browser = await puppeteer.launch(LAUNCH_OPTION);

    // スクレイピングを実行
    const result = await _Do_ScrapePage(browser, url);

    // Puppeteerを終了
    await browser.close();

    //結果
    return result;
}

interface FileList {
    tree: File[];
    name: string;
    href: string;
    type: string;
    comment?: string;
}


async function main() {
    console.log("スクレイピングを開始します...");
    const result = await ScrapePage(URL);
    console.log("スクレイピングが完了しました。");

    // 結果を表示
    console.log("結果を出力します...");
    console.log(JSON.stringify(result, null, 2));

    fs.writeFileSync("/Users/n/Desktop/result.json", JSON.stringify(result, null, 2), "utf-8");

}


main();