"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = __importDefault(require("puppeteer"));
const URL = "https://guide.gcas.cloud.go.jp/";
const ExcludeURL1 = "https://guide.gcas.cloud.go.jp/privacy-policy/";
const ExcludeURL2 = "https://guide.gcas.cloud.go.jp/search/";
const MaxDepth = 3; // スクレイピングの深さ
function ScrapePage(browser_1, url_1) {
    return __awaiter(this, arguments, void 0, function* (browser, url, depth = 0) {
        // output
        let output = [];
        // 深さが最大値に達した場合は終了
        if (depth > MaxDepth) {
            console.log(`最大深さ ${MaxDepth} に達しました。: ${url}`);
            return;
        }
        // スクレーピング
        try {
            const page = yield browser.newPage();
            yield page.goto(url);
            const elements = yield page.$$eval('a', list => list.map(e => {
                const data = {
                    textContent: (function (x) {
                        if (x === null) {
                            return [];
                        }
                        // 改行文字で分割し、前後の空白を削除して、空でない要素だけをフィルタリング
                        return x.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
                    }(e.textContent)),
                    href: e.href
                };
                return data;
            }));
            //console.log(elements);
            //スクリーニング
            const screening = elements.filter(e => e.href.includes(url) &&
                !e.href.includes("#") &&
                !e.href.includes("mailto:") &&
                e.href != url &&
                e.href != ExcludeURL1 &&
                e.href != ExcludeURL2);
            console.log(screening);
            // screening.hrefがファイルかかそうでないかを判断し、ファイルならoutputに保存、それ以外なら再帰的にスクレイピング
            for (const e of screening) {
                const href = e.href;
                const textContent = e.textContent;
                // hrefがファイルかどうかを判断
                if (href.endsWith(".pdf") || href.endsWith(".docx") || href.endsWith(".xlsx") || href.endsWith(".pptx") || href.endsWith(".zip") || href.endsWith(".rar")) {
                    // ファイルの保存処理をここに追加
                    console.log(`ファイル: ${href}`);
                }
                else {
                    console.log(`再帰的にスクレイピング: ${href}`);
                    yield ScrapePage(browser, href, depth + 1);
                }
            }
            yield page.close();
        }
        catch (error) {
            console.error(`エラーが発生しました: ${error}`);
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Puppeteerの起動
        const LAUNCH_OPTION = {
            headless: false, // ヘッドレスモードを有効にする
        };
        const browser = yield puppeteer_1.default.launch(LAUNCH_OPTION);
        // スクレイピングを実行
        yield ScrapePage(browser, URL)
            .then(() => {
            console.log("スクレイピングが完了しました。");
        })
            .catch((error) => {
            console.error("エラーが発生しました:", error);
        });
        // Puppeteerを終了
        yield browser.close();
    });
}
main();
