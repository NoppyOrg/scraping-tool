import puppeteer, { Browser } from "puppeteer";
import XlsxPopulate from "xlsx-populate";
import fs from "fs";

const JSON_FILE = "output.json"; // 出力ファイル名
const EXCEL_FILE = "output.xlsx"; // 出力ファイル名

// スクレイピングするURL  
const URL = "https://guide.gcas.cloud.go.jp/"
//const URL = "https://guide.gcas.cloud.go.jp/general/"; // スクレイピングするURL

const ExcludeURL1 = "https://guide.gcas.cloud.go.jp/privacy-policy/"
const ExcludeURL2 = "https://guide.gcas.cloud.go.jp/search/"
const MaxDepth = 4; // スクレイピングの深さ

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

interface Content {
    title: string;
    href: string;
    type: string;
    tree: File[];
}

let ListContents: Content[] = [];


async function _Do_ScrapePage(browser: Browser, url: string, depth: number = 0, ParentTree: File[] = []): Promise<ScrapePage | File> {
    // 変数の初期化
    let ret: ScrapePage = {
        title: "",
        href: "",
        type: "tree",
        children: [],
    }
    let tree: File[] = ParentTree.concat();

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

        //Create Tree Item
        const treeItem: File = {
            name: ret.title,
            href: ret.href,
            type: "tree",
        }
        tree.push(treeItem);

        // ハイパーリンクを収集して、hrefとtextContentを取得
        const elements = await page.$$eval('body >>> a', list => list.map(e => {
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
        console.log(elements);

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

        if (screening.length === 0) {
            const file: Content = {
                title: ret.title || "ファイル名不明",
                href: ret.href,
                type: "html",
                tree: ParentTree,
            }
            ListContents.push(file);
        } else {
            const file: Content = {
                title: ret.title || "ファイル名不明",
                href: ret.href,
                type: "tree",
                tree: tree,
            }
            ListContents.push(file);
        }



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

                //Create CurrentItem
                const CurrentItem: Content = {
                    title: file.name,
                    href: file.href,
                    type: file.type,
                    tree: tree,
                }
                ListContents.push(CurrentItem);

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

                    //Create CurrentItem
                    const CurrentItem: Content = {
                        title: file.name,
                        href: file.href,
                        type: file.type,
                        tree: ParentTree,
                    }
                    ListContents.push(CurrentItem);

                } else {
                    console.log(`再帰的にスクレイピング: ${href}`);
                    ret.children.push(await _Do_ScrapePage(browser, href, depth + 1, tree));

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
    console.log("結果(JSON)を出力します...");
    fs.writeFileSync(JSON_FILE, JSON.stringify(result, null, 2), "utf-8");
    //console.log(JSON.stringify(result, null, 2));

    //EXCEL出力
    //console.log(JSON.stringify(ListContents, null, 2), "utf-8");
    let workbook = await XlsxPopulate.fromBlankAsync();
    let sheet = workbook.sheet(0);

    // ヘッダーを追加
    sheet.cell("A1").value("#");
    sheet.cell("B1").value("区分1");
    sheet.cell("C1").value("区分2");
    sheet.cell("D1").value("区分3");
    sheet.cell("E1").value("ドキュメント名");
    sheet.cell("F1").value("ファイルタイプ");

    // データを追加
    ListContents.forEach((item, index) => {
        sheet.cell(`A${index + 2}`).value(index + 1);
        sheet.cell(`B${index + 2}`).value(item.tree[0].name);
        sheet.cell(`C${index + 2}`).value(item.tree[1]?.name || "");
        sheet.cell(`D${index + 2}`).value(item.tree[2]?.name || "");
        if (item.type === "tree") {
            sheet.cell(`E${index + 2}`).value("");
            sheet.cell(`F${index + 2}`).value("");
        } else {
            sheet.cell(`E${index + 2}`).value(item.title);
            sheet.cell(`F${index + 2}`).value(item.type);
        }
    });

    // Excelファイルを保存
    await workbook.toFileAsync(EXCEL_FILE);
    console.log("Excelファイルを出力しました。");
    // 終了
    console.log("終了します。");
    return 0;

}


main();