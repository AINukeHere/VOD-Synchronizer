import json

# JSON 파일 읽기
with open('src/rp_nicknames.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 각 서버별로 RP 닉네임들을 이름 순으로 정렬
sorted_data = {}
for server_name, nicknames in data.items():
    sorted_nicknames = sorted(nicknames, key=lambda x: x['rp'])
    sorted_data[server_name] = sorted_nicknames
    print(f"{server_name}: {len(sorted_nicknames)}개 정렬 완료")

# 정렬된 데이터를 파일에 저장
with open('src/rp_nicknames_sorted.json', 'w', encoding='utf-8') as f:
    json.dump(sorted_data, f, ensure_ascii=False, indent=2)

print("정렬 완료!") 