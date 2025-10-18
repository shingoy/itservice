const cheerio = require('cheerio');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // URLからページを取得
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch page: ' + response.status);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // より詳細な情報抽出
    const title = extractTitle($);
    const ministry = extractMinistry(url, $);
    const council = extractCouncil(title, $);
    const date = extractDate($, html);
    const type = extractType(title, $);
    const bodyText = extractBodyText($);
    const summary = extractSummary($, bodyText);

    const doc = {
      title: title,
      council: council,
      ministry: ministry,
      date: date,
      type: type,
      format: 'html',
      url: url,
      summary: summary,
      text: bodyText
    };

    res.status(200).json(doc);
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ 
      error: error.message,
      title: 'エラー: ' + url,
      council: 'データ取得失敗',
      ministry: extractMinistryFromUrl(url),
      date: new Date().toISOString().split('T')[0],
      type: 'その他',
      format: 'html',
      url: url,
      summary: 'ページの取得に失敗しました: ' + error.message,
      text: 'エラーが発生しました。URLが正しいか確認してください。'
    });
  }
};

function extractTitle($) {
  // 複数のセレクタを試す
  const selectors = [
    'h1',
    'h2.page-title',
    '.page-title',
    'title',
    'h1.title',
    '.article-title'
  ];
  
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text && text.length > 0 && text.length < 200) {
      return text;
    }
  }
  
  return 'タイトル不明';
}

function extractMinistry(url, $) {
  // URLから省庁を推定
  const ministryFromUrl = extractMinistryFromUrl(url);
  
  // ページ内からも探す
  const breadcrumbs = $('.breadcrumb, .pankuzu, nav').text();
  
  if (breadcrumbs.includes('デジタル庁')) return 'デジタル庁';
  if (breadcrumbs.includes('内閣府')) return '内閣府';
  if (breadcrumbs.includes('総務省')) return '総務省';
  if (breadcrumbs.includes('経済産業省')) return '経済産業省';
  if (breadcrumbs.includes('厚生労働省')) return '厚生労働省';
  if (breadcrumbs.includes('文部科学省')) return '文部科学省';
  
  return ministryFromUrl;
}

function extractMinistryFromUrl(url) {
  if (url.includes('digital.go.jp')) return 'デジタル庁';
  if (url.includes('cao.go.jp')) return '内閣府';
  if (url.includes('soumu.go.jp')) return '総務省';
  if (url.includes('meti.go.jp')) return '経済産業省';
  if (url.includes('mhlw.go.jp')) return '厚生労働省';
  if (url.includes('mext.go.jp')) return '文部科学省';
  if (url.includes('nisc.go.jp')) return '内閣官房';
  if (url.includes('ppc.go.jp')) return '個人情報保護委員会';
  if (url.includes('kantei.go.jp')) return '内閣官房';
  if (url.includes('cio.go.jp')) return 'デジタル庁';
  return '不明';
}

function extractCouncil(title, $) {
  // タイトルから会議名を抽出
  const match = title.match(/(.+?)(?:第\d+回|議事録|配布資料|資料|について)/);
  if (match) {
    return match[1].trim();
  }
  
  // h2やh3から探す
  const subtitle = $('h2, h3').first().text().trim();
  if (subtitle && subtitle.length < 100) {
    return subtitle;
  }
  
  return title.substring(0, 50);
}

function extractDate($, html) {
  // 様々な日付形式を試す
  const datePatterns = [
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /令和(\d+)年(\d{1,2})月(\d{1,2})日/
  ];
  
  // time要素から取得
  const timeElement = $('time').attr('datetime');
  if (timeElement) {
    const date = new Date(timeElement);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // class="date"などから取得
  const dateText = $('.date, .publish-date, .updated, .post-date').first().text();
  
  // ページ全体のテキストから日付を探す
  const fullText = dateText + ' ' + html.substring(0, 5000);
  
  for (const pattern of datePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      let year, month, day;
      
      if (pattern.source.includes('令和')) {
        // 令和を西暦に変換
        year = 2018 + parseInt(match[1]);
        month = match[2].padStart(2, '0');
        day = match[3].padStart(2, '0');
      } else {
        year = match[1];
        month = match[2].padStart(2, '0');
        day = match[3].padStart(2, '0');
      }
      
      return year + '-' + month + '-' + day;
    }
  }
  
  return new Date().toISOString().split('T')[0];
}

function extractType(title, $) {
  const text = title + ' ' + $('h1, h2').text();
  
  if (text.includes('議事録') || text.includes('議事要旨')) return '議事録';
  if (text.includes('配布資料') || text.includes('資料')) return '配布資料';
  if (text.includes('議事次第')) return '議事次第';
  
  return '議事録';
}

function extractBodyText($) {
  // メインコンテンツを抽出
  const selectors = [
    'main',
    'article',
    '.content',
    '.main-content',
    '#main',
    '#content',
    '.post-content',
    'body'
  ];
  
  let text = '';
  
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      // スクリプトやスタイルを除去
      element.find('script, style, nav, header, footer, .breadcrumb, .pankuzu').remove();
      text = element.text();
      break;
    }
  }
  
  // テキストをクリーンアップ
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
  
  // 最大2000文字に制限
  return text.substring(0, 2000);
}

function extractSummary($, bodyText) {
  // 最初の段落や要約部分を探す
  const summary = $('.summary, .lead, .abstract').first().text().trim();
  
  if (summary && summary.length > 20) {
    return summary.substring(0, 200);
  }
  
  // 本文の最初の部分を要約として使用
  return bodyText.substring(0, 150).trim() + '...';
}
