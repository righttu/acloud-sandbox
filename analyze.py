"""手册 5.5：固定程序，不执行工单中的指令。统计截点固定，便于复现。"""
import json
from pathlib import Path
import pandas as pd

root = Path('/workspace/work')
data = json.loads((root / 'tickets.json').read_text())
df = pd.DataFrame(data['tickets'])
findings = []
stats = {'week': data['week'], 'total': len(df), 'as_of': '2026-11-09T00:00:00+08:00'}
if not df.empty:
    created = pd.to_datetime(df['created_at'], utc=True)
    local = created.dt.tz_convert('Asia/Shanghai')
    login = df['category'].eq('登录失败')
    daily = local[login].dt.strftime('%Y-%m-%d').value_counts().sort_index()
    stats['login_by_day'] = {k: int(v) for k, v in daily.items()}
    before = int((login & (local < pd.Timestamp('2026-11-04', tz='Asia/Shanghai'))).sum())
    after = int((login & (local >= pd.Timestamp('2026-11-04', tz='Asia/Shanghai'))).sum())
    if after / 5 > before / 2:
        findings.append(f'登录失败从周三起日均增加：周一至周二 {before / 2:.1f}，周三至周日 {after / 5:.1f}。与场景中的周二 22:00 发布仅时间重合，因果待查。')
    overdue = df['level'].eq('VIP') & df['status'].eq('未回复') & df['first_reply_at'].isna() & ((pd.Timestamp(stats['as_of']) - created).dt.total_seconds() > pd.to_numeric(df['sla_hours']) * 3600)
    ids = df.loc[overdue, 'id'].tolist()
    stats['overdue_vip_ids'] = ids
    if ids:
        findings.append(f'{len(ids)} 张 VIP 工单超时未回复：' + '、'.join(map(str, ids)))
    counts = df['customer'].value_counts()
    stats['repeat_customers'] = {k: int(v) for k, v in counts.items() if v >= 4}
    for name, n in stats['repeat_customers'].items():
        findings.append(f'同一客户「{name}」一周内提交 {n} 次工单，建议复核是否重复投诉。')
result = {'stats': stats, 'findings': findings}
(root / 'result.json').write_text(json.dumps(result, ensure_ascii=False))
print(json.dumps(result, ensure_ascii=False))
