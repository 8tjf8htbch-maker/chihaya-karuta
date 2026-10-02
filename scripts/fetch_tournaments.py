#!/usr/bin/env python3
import json,re
from datetime import datetime,timedelta
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

LIST_URL="https://www.karuta.or.jp/cup-info/"
OUT="data/tournaments.json"
HEADERS={"User-Agent":"Kokudai-Karuta-Tournament-Bot/1.0"}

def clean(s):
    return re.sub("[ \\t\\r\\n]+"," ",s or "").strip()

def iso_date(s):
    m=re.search(r"(20[0-9]{2})[./-]([0-9]{1,2})[./-]([0-9]{1,2})",s or "")
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None

def after_label(lines,label):
    for i,x in enumerate(lines):
        if label not in x:
            continue
        same=clean(x.split(label,1)[1])
        if same:
            return same
        for y in lines[i+1:i+6]:
            y=clean(y)
            if y and label not in y:
                return y
    return ""

def prefecture(text):
    prefs=["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"]
    for p in prefs:
        if p in text:return p
    city_map={"横浜市":"神奈川県","川崎市":"神奈川県","相模原市":"神奈川県","鎌倉市":"神奈川県","藤沢市":"神奈川県","平塚市":"神奈川県","さいたま市":"埼玉県","川口市":"埼玉県","川口":"埼玉県","春日部市":"埼玉県","千葉市":"千葉県","成田市":"千葉県","成田":"千葉県","船橋市":"千葉県","柏市":"千葉県","松戸市":"千葉県","市川市":"千葉県","墨田区":"東京都","渋谷区":"東京都","世田谷区":"東京都","新宿区":"東京都","豊島区":"東京都","江東区":"東京都","江戸川区":"東京都","八王子市":"東京都","立川市":"東京都","町田市":"東京都","関東第一":"東京都","関東第一高等学校":"東京都","宇都宮市":"栃木県","宇都宮":"栃木県","水戸市":"茨城県","高崎市":"群馬県","前橋市":"群馬県","大宮":"埼玉県"}
    for c,p in city_map.items():
        if c in text:return p
    return ""

def parse_detail(url):
    r=requests.get(url,headers=HEADERS,timeout=20);r.raise_for_status()
    soup=BeautifulSoup(r.text,"html.parser")
    lines=[clean(x) for x in soup.stripped_strings if clean(x)]
    name=after_label(lines,"大会名称") or (soup.find("h1").get_text(" ",strip=True) if soup.find("h1") else "")
    date=iso_date(after_label(lines,"開催日"))
    venue=after_label(lines,"会場")
    rank_text=after_label(lines,"級")
    ranks=sorted(set(re.findall(r"(?<![A-Z])[ABCDE](?=級|[,、 ]|$)",rank_text)),key="ABCDE".index)
    deadline=iso_date(after_label(lines,"事前申込"))
    docs=[]
    seen_docs=set()
    file_exts=(".pdf",".doc",".docx",".xls",".xlsx")
    keywords=("大会情報","大会案内","開催案内","参加申込","申込書","案内")
    for a in soup.find_all("a",href=True):
        label=clean(a.get_text(" ",strip=True))
        href=urljoin(url,a["href"])
        href_lower=href.lower().split("?",1)[0]
        is_document=href_lower.endswith(file_exts)
        is_named_document=any(k in label for k in keywords)
        if (is_document or is_named_document) and href not in seen_docs:
            seen_docs.add(href)
            # ラベルが空・汎用的な場合でも、ファイル種別から取得対象と分かるようにする
            if not label:
                label="大会資料"
            docs.append({"label":label,"url":href})
    series=re.sub(r"第 *[0-9]+ *回","",name).strip()
    series=re.sub(r"第 *[0-9]+ *次","",series).strip()
    return {"id":"karuta-"+re.sub(r"[^0-9a-z]+","-",url.lower()).strip("-"),
            "seriesId":series or name,"name":name,"date":date,"venue":venue,
            "prefecture":prefecture(" ".join(lines)),"ranks":ranks,
            "officialDeadline":deadline,
            "kokudaiDeadline":(datetime.strptime(deadline,"%Y-%m-%d")-timedelta(days=7)).strftime("%Y-%m-%d") if deadline else None,
            "sourceUrl":url,"documents":docs,"fetchedAt":datetime.now().astimezone().isoformat()}

def main():
    html=requests.get(LIST_URL,headers=HEADERS,timeout=20);html.raise_for_status()
    soup=BeautifulSoup(html.text,"html.parser")
    urls=[]
    for a in soup.find_all("a",href=True):
        u=urljoin(LIST_URL,a["href"])
        if "/cup-info/" in u and u.rstrip("/")!=LIST_URL.rstrip("/") and "/date/" not in u and u not in urls:
            urls.append(u)
    rows=[]
    for u in urls:
        try:
            x=parse_detail(u)
            if x["date"] and x["name"]:rows.append(x)
        except Exception as e:
            print("skip",u,e)
    rows.sort(key=lambda x:x["date"])
    with open(OUT,"w",encoding="utf-8") as f:json.dump(rows,f,ensure_ascii=False,indent=2);f.write("\\n")
    print("saved",len(rows),"tournaments")

if __name__=="__main__":main()
