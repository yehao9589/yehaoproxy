from pathlib import Path
import re
import sqlite3

CITY_NAMES = {
    "Los Angeles":"洛杉矶","New York":"纽约","San Francisco":"旧金山","Chicago":"芝加哥","Seattle":"西雅图","Miami":"迈阿密","Dallas":"达拉斯","Virginia":"弗吉尼亚","Tokyo":"东京","Osaka":"大阪","Yokohama":"横滨","Nagoya":"名古屋","Fukuoka":"福冈","London":"伦敦","Manchester":"曼彻斯特","Birmingham":"伯明翰","Frankfurt":"法兰克福","Berlin":"柏林","Munich":"慕尼黑","Hamburg":"汉堡","Paris":"巴黎","Marseille":"马赛","Lyon":"里昂","Toronto":"多伦多","Vancouver":"温哥华","Montreal":"蒙特利尔","Sydney":"悉尼","Melbourne":"墨尔本","Brisbane":"布里斯班","Singapore":"新加坡","Seoul":"首尔","Busan":"釜山","Hong Kong":"香港","Taipei":"台北","Kaohsiung":"高雄","Sao Paulo":"圣保罗","São Paulo":"圣保罗","Rio de Janeiro":"里约热内卢","Mumbai":"孟买","Delhi":"德里","Bangalore":"班加罗尔","Amsterdam":"阿姆斯特丹","Rotterdam":"鹿特丹","Milan":"米兰","Rome":"罗马","Madrid":"马德里","Barcelona":"巴塞罗那","Moscow":"莫斯科","Saint Petersburg":"圣彼得堡","Dubai":"迪拜","Abu Dhabi":"阿布扎比","Kuala Lumpur":"吉隆坡","Bangkok":"曼谷","Ho Chi Minh City":"胡志明市","Hanoi":"河内","Jakarta":"雅加达","Manila":"马尼拉","Auckland":"奥克兰","Zurich":"苏黎世","Geneva":"日内瓦","Stockholm":"斯德哥尔摩","Oslo":"奥斯陆","Helsinki":"赫尔辛基","Warsaw":"华沙","Istanbul":"伊斯坦布尔","Johannesburg":"约翰内斯堡","Cape Town":"开普敦","Mexico City":"墨西哥城","Other":"其他城市"
}

def migrate(path: Path) -> int:
    db = sqlite3.connect(path)
    try:
        exists = db.execute("select 1 from sqlite_master where type='table' and name='proxy_allocations'").fetchone()
        if not exists:
            return 0
        changed = 0
        for row_id, note in db.execute("select id, note from proxy_allocations where note like '%[CITY]%' ").fetchall():
            current = re.search(r"\[CITY\]([^\n]*)", note or "")
            if not current:
                continue
            chinese = CITY_NAMES.get(current.group(1).strip())
            if not chinese:
                continue
            updated = (note or "")[:current.start(1)] + chinese + (note or "")[current.end(1):]
            db.execute("update proxy_allocations set note=? where id=?", (updated, row_id))
            changed += 1
        db.commit()
        return changed
    finally:
        db.close()

if __name__ == "__main__":
    total = 0
    for database in Path(".wrangler/state/v3/d1/miniflare-D1DatabaseObject").glob("*.sqlite"):
        count = migrate(database)
        if count:
            print(f"{database}: migrated {count}")
            total += count
    print(f"total migrated: {total}")
