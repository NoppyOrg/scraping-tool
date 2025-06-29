import puppeteer, { Browser } from "puppeteer";
import XlsxPopulate from "xlsx-populate";

const JSON_FILE = "output.json"; // 出力ファイル名
const EXCEL_FILE = "output.xlsx"; // 出力ファイル名

// スクレイピングするURL  
// const URL = "https://guide.gcas.cloud.go.jp/"
const URL = "https://test.guide.gcas.cloud.go.jp/" // テスト用
//const URL = "https://test.guide.gcas.cloud.go.jp/general/"; // テスト用
//const URL = "https://test.guide.gcas.cloud.go.jp/general/reference-architecture-document-download"; // テスト用


// 画像の保管場所のURL(GCASの仕様では、html以外のファイルは、すべて/images/または/member/images/に格納されている)
const ImageURL: string[] = [
    "https://test.guide.gcas.cloud.go.jp/images/", // Publicの画像の保管場所のURL
    "https://test.guide.gcas.cloud.go.jp/member/images/", // 非公開領域の画像の保管場所のURL
]

// 除外するURLリスト。ここに含まれるURLはスクレイピングの対象外とする
const ExcludeURL: string[] = [
    "https://test.guide.gcas.cloud.go.jp/privacy-policy/",
    "https://test.guide.gcas.cloud.go.jp/search",
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
let DeptWaterMark: number = 0; // スクレイピングの深さを管理するためのマーカー

//スクレーピング済みURLを登録するリスト
let ScrapedUrls: string[] = [];

async function _Do_GoogleAuth(browser: Browser) {
    /**
     * _Do_GoogleAuth関数: Google認証を行う関数
     *  @param browser - Puppeteerのブラウザインスタンス
     */
    // Google認証を行うためのページを開く
    const page = await browser.newPage();
    await page.goto("https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Faccounts.google.com%2F&followup=https%3A%2F%2Faccounts.google.com%2F&ifkv=AdBytiOrimCtpiL4L8UpDYhNkENe4U95vaWtZP1BYyOFVhEY3KCEEbMpyYtDxcfcQV9Xtuu8wrK9&passive=1209600&flowName=GlifWebSignIn&flowEntry=ServiceLogin&dsh=S1614016228%3A1751193176223493", { waitUntil: 'networkidle2' }); // networkidle2は、ネットワーク接続がアイドル状態になるまで待機 
    console.log("Google認証ページを開きました。");
    // 認証情報を入力する
    // ここでは、手動で認証を行うことを想定しています
    console.log("手動でGoogle認証を行ってください。");
    console.log("認証が完了したら、Enterキーを押してください。");
    // 認証が完了するまで待機
    await new Promise(resolve => {
        process.stdin.once('data', () => {
            resolve(null);
        });
    });
    console.log("Google認証が完了しました。");
    // 認証後、ページを閉じる
    await page.close();
    return;
}


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

    // DepthWaterMarkを更新
    if (depth > DeptWaterMark) {
        DeptWaterMark = depth; // 現在の深さをマーク
    }

    // スクレーピング
    try {
        // ページを開く
        const page = await browser.newPage();
        await page.goto(target_url, { 'waitUntil': 'networkidle2' }); //domcontentloaded

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

        //本ページをスクレイピング済みURLに追加する
        ScrapedUrls.push(href);
        ScrapedUrls.push(href + '/');
        //console.log('スクレーピング済みURLリスト', ScrapedUrls)

        // ハイパーリンクを収集して、hrefとtextContentを取得
        const elements = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            return links.map(link => ({
                textContent: (function (x) {
                    if (x === null) {
                        return [];
                    }
                    // 改行文字で分割し、前後の空白を削除
                    return x.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
                }(link.textContent)),
                href: link.href
            }));
        });

        // 収集した要素をログに出力
        // console.log("収集した要素:");
        // console.log(elements);

        //ハイパーリンクのスクリーニング
        const screening = elements.filter(e =>
            (
                // html以外のファイルの場合
                ImageURL.some(url => e.href.startsWith(url)) // 画像の保管場所のURLを含む
            ) || (
                // htmlファイルの場合
                e.href.startsWith(base_url) &&   // ベースURLを含む
                e.href.includes(ParentTree[ParentTree.length - 1]?.href || "") && // 親のツリー構造のURLを含む
                !e.href.includes('#') &&        // ハッシュリンクを除外
                e.href != target_url &&         // 現在のURLを除外
                !ScrapedUrls.includes(e.href) && // スクレーピング済みURLを除外
                !ExcludeURL.includes(e.href) && // 除外URLリストに含まれない
                !e.textContent.includes("前の章へ") && // 特定のテキストを含まない
                !e.textContent.includes("次の章へ")    // 特定のテキストを含まない
            )
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
    //console.log("結果(JSON)を出力します...");
    //console.log(JSON.stringify(ListContents, null, 2));

    //EXCEL出力
    //console.log(JSON.stringify(ListContents, null, 2), "utf-8");
    let workbook = await XlsxPopulate.fromBlankAsync();
    let sheet = workbook.sheet(0);

    // ヘッダーを追加
    sheet.cell(1, 1).value("#");
    for (let i = 2; i <= DeptWaterMark + 1; i++) {
        sheet.cell(1, i).value(`階層${i - 1}`);
    }
    sheet.cell(1, DeptWaterMark + 2).value("ドキュメント名");
    sheet.cell(1, DeptWaterMark + 3).value("ファイルタイプ");
    sheet.cell(1, DeptWaterMark + 4).value("URL");

    // データを追加
    ListContents.forEach((element, index) => {
        sheet.cell(index + 2, 1).value(index + 1);
        for (let i = 2; i <= element.tree.length + 1; i++) {
            sheet.cell(index + 2, i).value(element.tree[i - 2].name || "");
        }
        if (element.type !== "tree") {
            sheet.cell(index + 2, DeptWaterMark + 2).value(element.title || "");
        }
        sheet.cell(index + 2, DeptWaterMark + 3).value(element.type || "");
        sheet.cell(index + 2, DeptWaterMark + 4).value(element.href || "");
    });

    // Excelファイルを保存
    await workbook.toFileAsync(EXCEL_FILE);
    console.log("Excelファイルを出力しました。");

    // 終了
    console.log("終了します。");
    return 0;

}


main();