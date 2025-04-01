import puppeteer, { Browser } from "puppeteer";

const URL = "https://guide.gcas.cloud.go.jp/"
const ExcludeURL1 = "https://guide.gcas.cloud.go.jp/privacy-policy/"
const ExcludeURL2 = "https://guide.gcas.cloud.go.jp/search/"
const MaxDepth = 3; // スクレイピングの深さ


async function ScrapePage(browser: Browser, url: string, depth: number = 0) {
    // output
    let output = [];

    // 深さが最大値に達した場合は終了
    if (depth > MaxDepth) {
        console.log(`最大深さ ${MaxDepth} に達しました。: ${url}`);
        return;
    }

    // スクレーピング
    try {
        const page = await browser.newPage();
        await page.goto(url);

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

        //スクリーニング
        const screening = elements.filter(e =>
            e.href.includes(url) &&
            !e.href.includes("#") &&
            !e.href.includes("mailto:") &&
            e.href != url &&
            e.href != ExcludeURL1 &&
            e.href != ExcludeURL2
        );
        console.log(screening);

        // screening.hrefがファイルかかそうでないかを判断し、ファイルならoutputに保存、それ以外なら再帰的にスクレイピング
        for (const e of screening) {
            const href = e.href;
            const textContent = e.textContent;
            // hrefがファイルかどうかを判断
            if (href.endsWith(".pdf") || href.endsWith(".docx") || href.endsWith(".xlsx") || href.endsWith(".pptx") || href.endsWith(".zip") || href.endsWith(".rar")) {
                // ファイルの保存処理をここに追加
                console.log(`ファイル: ${href}`);

            } else {
                console.log(`再帰的にスクレイピング: ${href}`);
                await ScrapePage(browser, href, depth + 1);
            }
        }

        await page.close();

    } catch (error) {
        console.error(`エラーが発生しました: ${error}`);
    }
}

async function main() {
    // Puppeteerの起動
    const LAUNCH_OPTION = {
        headless: false, // ヘッドレスモードを有効にする
    };
    const browser = await puppeteer.launch(LAUNCH_OPTION);

    // スクレイピングを実行
    await ScrapePage(browser, URL)
        .then(() => {
            console.log("スクレイピングが完了しました。");
        })
        .catch((error) => {
            console.error("エラーが発生しました:", error);
        });

    // Puppeteerを終了
    await browser.close();

}

main()