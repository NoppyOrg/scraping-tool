import puppeteer, { Browser } from "puppeteer";
import XlsxPopulate from "xlsx-populate";
import fs from "fs";

const JSON_FILE = "output.json"; // 出力ファイル名
const EXCEL_FILE = "output.xlsx"; // 出力ファイル名

// スクレイピングするURL  
// const URL = "https://guide.gcas.cloud.go.jp/"
const URL = "https://test.guide.gcas.cloud.go.jp/general/"; // テスト用
//const URL = "https://test.guide.gcas.cloud.go.jp/general/overview/" // テスト用

const ExcludeURL: string[] = [
    "https://guide.gcas.cloud.go.jp/privacy-policy/",
    "https://guide.gcas.cloud.go.jp/search/",
]
const MaxDepth = 4; // スクレイピングの深さ


interface File {
    name: string;
    href: string;
    type: string;
    comment?: string;
}

interface Content {
    title: string;
    href: string;
    type: string;
    tree: File[];
}

let ListContents: Content[] = [];


async function _Do_ScrapePage(browser: Browser, target_url: string, base_url: string = "", depth: number = 0, ParentTree: File[] = []) {
    /**
     * _Do_ScrapePage関数:  スクレイピングを実行する関数
     *  @param browser - Puppeteerのブラウザインスタンス
     *  @param target_url - スクレイピング対象のURL
     *  @param base_url - ベースURL（初回は空文字列）
     *  @param depth - 現在のスクレイピングの深さ
     *  @param ParentTree - 親のツリー構造（初回は空配列）
     */

    // スクレーピング開始メッセージ
    console.log(`スクレイピングを開始します: ${target_url} (深さ: ${depth})`);

    // 初期化
    if (base_url === "") {
        base_url = target_url; // 初回はtarget_urlをベースURLとして設定
    }

    // スクレーピング
    try {
        // ページを開く
        const page = await browser.newPage();
        await page.goto(target_url, { 'waitUntil': 'networkidle0' }); //domcontentloaded

        // ページタイトルを取得
        // page.title()の文字列から最初の" | "以降を削除して、ret.titleに格納する
        let title: string = "";
        const _title = await page.title();
        const _titleIndex = _title.indexOf(" | ");
        if (_titleIndex !== -1) {
            title = _title.substring(0, _titleIndex);
        } else {
            title = _title || "タイトル不明";
        }

        // URLを取得
        const href: string = page.url();

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
        // 収集した要素をログに出力
        //console.log("収集した要素:");
        //console.log(elements);

        // ParentTreeの要素のhrefのデータでリストを作成する
        const ParentTreeLinks: string[] = ParentTree.map(e => e.href);

        //ハイパーリンクのスクリーニング
        const screening = elements.filter(e =>
            e.href.includes(base_url) &&   // ベースURLを含む
            e.href.includes(ParentTree[ParentTree.length - 1]?.href || "") && // 親のツリー構造のURLを含む
            !e.href.includes('/#') &&        // ハッシュリンクを除外
            !e.href.includes("mailto:") &&  // メールリンクを除外
            !e.href.includes('javascript:') && // JavaScriptリンクを除外
            e.href != target_url &&         // 現在のURLを除外
            !ParentTreeLinks.includes(e.href) && // 親のツリー構造のURLと一致するものは除外
            !ExcludeURL.includes(e.href) // 除外URLリストに含まれない
        );
        //console.log("スクリーニング結果");
        //console.log(screening);

        // Tree構造の作成と登録
        let tree: File[] = ParentTree.concat(); // 親のツリー構造をコピー
        const treeItem: File = {
            name: title,
            href: href,
            type: "tree",
        }
        tree.push(treeItem);

        // 取得ページ自身のコンテンツ判断と登録
        if (screening.length === 0) {
            // 子コンテンツがない場合は、親のツリー構造をそのまま登録
            const file: Content = {
                title: title,
                href: href,
                type: "html",
                tree: ParentTree,
            }
            ListContents.push(file);
        } else {
            // 子コンテンツがある場合は、現在のページのツリー構造を登録
            const file: Content = {
                title: title,
                href: href,
                type: "tree",
                tree: tree,
            }
            ListContents.push(file);
        }

        // screening.hrefがファイルかかそうでないかを判断し、ファイルならoutputに保存、それ以外なら再帰的にスクレイピング
        for (const e of screening) {
            const dest_href = e.href;
            const dest_textContent = e.textContent;
            // hrefがファイルかどうかを判断
            if (dest_href.endsWith(".pdf") || dest_href.endsWith(".docx") || dest_href.endsWith(".xlsx") || dest_href.endsWith(".pptx") || dest_href.endsWith(".zip") || dest_href.endsWith(".rar")) {
                //Create CurrentItem
                const CurrentItem: Content = {
                    title: dest_textContent[0] || "ファイル名不明",
                    href: dest_href,
                    type: dest_href.split('.').pop() || "unknown",
                    tree: tree,
                }
                ListContents.push(CurrentItem);

            } else {
                if (depth >= MaxDepth) {
                    console.log(`最大深度に達しました: ${depth}`);

                    //最大深度に達した場合は、ファイルとして登録
                    const CurrentItem: Content = {
                        title: dest_textContent[0] || "ファイル名不明",
                        href: dest_href,
                        type: "html",
                        tree: ParentTree,
                    }
                    ListContents.push(CurrentItem);

                } else {
                    await _Do_ScrapePage(browser, dest_href, base_url, depth + 1, tree);
                }
            }
        }

        await page.close();

    } catch (error) {
        console.error(`エラーが発生しました: ${error}`);
    }

    return;
}

async function ScrapePage(target_url: string) {
    // Puppeteerの起動
    const LAUNCH_OPTION = {
        headless: false, // ヘッドレスモードを有効にする
    };
    const browser = await puppeteer.launch(LAUNCH_OPTION);

    // スクレイピングを実行
    const result = await _Do_ScrapePage(browser, target_url);

    // Puppeteerを終了
    await browser.close();

    //結果
    return result;
}


async function main() {
    console.log("スクレイピングを開始します...");
    const result = await ScrapePage(URL);
    console.log("スクレイピングが完了しました。");



    // 結果を表示
    console.log("結果(JSON)を出力します...");
    console.log(JSON.stringify(ListContents, null, 2));

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
        sheet.cell(`B${index + 2}`).value(item.tree[0].name || "");
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