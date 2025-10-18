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
      },
      timeout: 10000 // 10秒タイムアウト
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch: ' + response.status);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // より詳細な情報抽出
    const title = extractTitle($);
    const ministry = extractMinistryFromUrl(url);
    const bodyText = extractBodyText($);

    const doc = {
      title: title || 'タイトル不明',
      council: extractCouncil(title),
      ministry: ministry,
      date: extractDate($, html),
      type: extractType(title),
      format: 'html',
      url: url,
      summary: bodyText.substring(0, 150) + '...',
      text: bodyText
    };

    return res.status(200).json(doc);
    
  } catch (error) {
    console.error('Error:', error.message);
    
    // エラー時もデータを返す（500エラーを避ける）
    const ministry = extractMinistryFromUrl(url);
    
    return res.status(200).json({
      title: 'データ取得失敗: ' + url.split('/').pop(),
      council: '取得失敗',
      ministry: ministry,
      date: new Date().toISOString().split('T')[0],
      type: 'その他',
      format: 'html',
      url: url,
      summary: 'ページの取得に失敗しました。URLを確認してください。',
      text: 'エラー: ' + error.message
    });
  }
};

function extractTitle($) {
  let title = $('h1').first().text().trim();
  if (!title) title = $('title').text().trim();
  if (!title) title = $('h2').first().text().trim();
  
  // タイトルが長すぎる場合は短縮
  if (title.length > 200) {
    title = title.substring(0, 200) + '...';
  }
  
  return title || 'タイトル不明';
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

function extractCouncil(title) {
  if (!title) return '会議名不明';
  
  const match = title.match(/(.+?)(?:第\d+回|議事録|配布資料)/);
  if (match) {
    return match[1].trim();
  }
  
  // 最初の50文字を会議名として使用
  return title.substring(0, 50);
}

function extractDate($, html) {
  // time要素から取得
  const timeElement = $('time').attr('datetime');
  if (timeElement) {
    try {
      const date = new Date(timeElement);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
      // 無視
    }
  }
  
  // 日付パターンをテキストから探す
  const dateText = $('.date, .publish-date, .updated').first().text();
  const fullText = dateText + ' ' + html.substring(0, 3000);
  
  const patterns = [
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/
  ];
  
  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      return year + '-' + month + '-' + day;
    }
  }
  
  // デフォルトは今日の日付
  return new Date().toISOString().split('T')[0];
}

function extractType(title) {
  if (!title) return '議事録';
  
  if (title.includes('議事録') || title.includes('議事要旨')) return '議事録';
  if (title.includes('配布資料') || title.includes('資料')) return '配布資料';
  
  return '議事録';
}

function extractBodyText($) {
  // 不要な要素を削除
  $('script, style, nav, header, footer, .breadcrumb').remove();
  
  // メインコンテンツを取得
  let text = $('main').text();
  if (!text || text.length < 100) {
    text = $('article').text();
  }
  if (!text || text.length < 100) {
    text = $('.content, .main-content').text();
  }
  if (!text || text.length < 100) {
    text = $('body').text();
  }
  
  // テキストをクリーンアップ
  text = text
    .replace(/\s+/g, ' ')
    .trim();
  
  // 最大1500文字
  return text.substring(0, 1500);
}
