const subjectRules = [
    {
        category: '理論',
        subject: 'テクノロジ',
        keywords: [
            [/2進数|2の補数|補数|浮動小数点|単精度|倍精度|符号付き|真理値表|論理演算|ビット演算/, 5],
            [/CPU|プロセッサ|主記憶|記憶装置|キャッシュ|パイプライン|命令セット|クロック周波数|レジスタ/, 4],
            [/オペレーティングシステム|\bOS\b|仮想記憶|ページング|RAID|稼働率|MTBF|MTTR|文字コード/, 4],
            [/XML|HTML|SGML|マークアップ言語|オブジェクト指向|多相性|カプセル化|オーバーライド|クラスとインスタンス/, 5],
            [/統合開発環境|プログラミング言語|大規模言語モデル|ファインチューニング|生成AI/, 4],
            [/メモリインタリーブ|USB\s*[123](?:\.\d)?|フラッシュメモリ|磁気ディスク|RAM|ROM|エッジコンピューティング|VDI/, 5],
            [/クラスとインスタンス|インスタンス|継承|オブジェクト指向|統合開発環境|静的テストツール/, 4],
            [/コンピュータ|メモリ|入出力|ハードウェア|性能評価|平均アクセス時間/, 2],
        ],
    },
    {
        category: 'ネットワーク',
        subject: 'テクノロジ',
        keywords: [
            [/ネットワーク|通信プロトコル|TCP|UDP|IPアドレス|IPv4|IPv6|DNS|DHCP|OSI参照モデル|サブネット/, 5],
            [/ルータ|ルーティング|LAN|WAN|無線LAN|ファイアウォール|データ伝送|通信回線|帯域幅/, 4],
            [/HTTP|HTTPS|SMTP|POP3|IMAP|トランスポート層|ネットワーク層|データリンク層|ポート番号/, 4],
            [/伝送時間|回線利用率|待ち行列|伝送速度|パケット/, 3],
        ],
    },
    {
        category: 'データベース',
        subject: 'テクノロジ',
        keywords: [
            [/データベース|関係データベース|SQL|SELECT|INSERT|UPDATE|DELETE文|正規化|主キー|外部キー/, 5],
            [/トランザクション|排他制御|参照整合性|ER図|データベース管理システム|ビュー表|インデックス/, 4],
            [/テーブル|表に対する|表の主キー|データベース設計|候補キー|関数従属性|DBMS|RDBMS|スキーマ/, 4],
            [/キーバリューストア|データウェアハウス|データディクショナリ|導出表|ビューに関する/, 5],
        ],
    },
    {
        category: 'セキュリティ',
        subject: 'テクノロジ',
        keywords: [
            [/セキュリティ|情報漏えい|不正アクセス|脆弱性|マルウェア|コンピュータウイルス|サイバー攻撃/, 5],
            [/ドメイン名ハイジャック|リバースブルートフォース|ブルートフォース攻撃|ペネトレーションテスト|監査可能性/, 5],
            [/情報セキュリティ管理基準|セキュリティ管理策|情報セキュリティポリシー|テレワーキング運用規程/, 6],
            [/暗号|認証|電子署名|公開鍵|秘密鍵|共通鍵|アクセス制御|ファイアウォール|TLS|SSL/, 4],
            [/フィッシング|ランサムウェア|標的型攻撃|脅威|改ざん|機密性|完全性|可用性/, 4],
        ],
    },
    {
        category: 'プロジェクトマネジメント',
        subject: 'マネジメント',
        keywords: [
            [/プロジェクトマネジメント|プロジェクト管理|WBS|クリティカルパス|ガントチャート|工数見積り|進捗管理/, 5],
            [/プロジェクト|プレシデンスダイアグラム|PERT|EVM|作業日数|最短所要日数|費用増加率/, 4],
            [/サービスマネジメント|サービスレベル|SLA|ITIL|システム監査|変更管理|リスク管理/, 4],
            [/アジャイル開発|スクラム|要件定義|開発工程|ソフトウェア開発|システム開発|テスト工程|静的テスト|テストツール|単体テスト|結合テスト/, 3],
            [/マトリックス組織|事業部制組織|職能制組織|組織構造|ワークシェアリング/, 4],
            [/内部統制|統制環境|統制活動|内部監査|財務報告に係る|システムの外部設計|顧客から承認/, 5],
            [/生産方式|セル生産方式|生産計画|生産能力|製造能力|製造時間|MRP|資材所要量計画|保有機械|在庫管理|発注数量/, 5],
            [/デザインレビュー|開発スケジュール|要求の分析|設計するとき|状態遷移図|モジュール間|モジュール結合|結合度/, 4],
            [/品質管理|工数|保守運用|受入れテスト|ステークホルダ|レビュー|ドライバとスタブ/, 2],
        ],
    },
    {
        category: 'アルゴリズム',
        subject: 'テクノロジ',
        keywords: [
            [/アルゴリズム|擬似言語|フローチャート|計算量|再帰呼出し|二分探索|線形探索|ソート/, 5],
            [/配列|リスト構造|木構造|二分木|スタック|キュー|ポインタ|ハッシュ法|探索木/, 4],
            [/プログラム|関数|変数|繰返し|繰り返し|反復処理|条件分岐|プログラムコード/, 2],
        ],
    },
    {
        category: 'ストラテジ',
        subject: 'ストラテジ',
        keywords: [
            [/経営戦略|競争戦略|ニッチ戦略|マーケティング|SWOT|PEST|コアコンピタンス|ロングテール|市場占有率|競争優位/, 5],
            [/プロダクトポートフォリオ|市場成長率|ニッチ|ワークシェアリング|企業の様々な活動|顧客ニーズ|市場調査/, 5],
            [/財務諸表|損益分岐点|営業利益|原価計算|ROE|ROI|投資収益率|会計基準|固定費|変動費/, 5],
            [/著作権|特許権|知的財産|不正競争防止法|独占禁止法|コンプライアンス|個人情報保護法/, 4],
            [/CSR|カーボンフットプリント|環境経営|企業理念|事業戦略|製品戦略|ブランド戦略|PPM|プロダクトポートフォリオ/, 4],
            [/M&A|SCM|CRM|ERP|事業継続計画|BCP|データマイニング|マーケットバスケット|市場調査|顧客満足度|ロジックマッシュアップ/, 3],
        ],
    },
];

function rankSubjects(text) {
    return subjectRules.map(({ category, subject, keywords }) => ({
        category,
        subject,
        score: keywords.reduce((total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0), 0),
    })).sort((left, right) => right.score - left.score);
}

function confidentResult(scores, minimumScore, minimumMargin) {
    const [best, second] = scores;
    const margin = best.score - (second?.score ?? 0);

    if (!best || best.score < minimumScore || margin < minimumMargin) {
        return { subject: '', category: '', confidence: 'low', score: best?.score ?? 0, margin };
    }
    return {
        subject: best.subject,
        category: best.category,
        confidence: best.score >= 5 && margin >= 3 ? 'high' : 'medium',
        score: best.score,
        margin,
    };
}

export function classifySubject(question, optionText = '') {
    const promptResult = confidentResult(rankSubjects(String(question ?? '')), 3, 2);
    if (promptResult.category) return promptResult;

    const combinedText = `${String(question ?? '')} ${String(optionText ?? '')}`;
    const optionResult = confidentResult(rankSubjects(combinedText), 8, 4);
    if (optionResult.category) return { ...optionResult, confidence: 'medium' };
    return optionResult;
}

export const subjects = [...new Set(subjectRules.map(({ subject }) => subject))];
