"""Initialize private owner authentication. Existing authentication is preserved."""
import hashlib,json,os,secrets
from pathlib import Path
from dotenv import load_dotenv

root=Path(__file__).resolve().parent
load_dotenv(root/'.env')
data=Path(os.environ.get('AIROOM_DATA',root/'data'))
data.mkdir(parents=True,exist_ok=True,mode=0o700)
auth=data/'auth.json'
if not auth.exists():
    code=os.getenv('AIROOM_LOGIN_CODE','')
    if len(code)<16 or code.lower().startswith(('change','replace')):
        raise SystemExit('Set AIROOM_LOGIN_CODE to a unique secret of at least 16 characters in .env, then rerun setup.py')
    salt=secrets.token_bytes(24)
    payload={'salt':salt.hex(),'digest':hashlib.pbkdf2_hmac('sha256',code.encode(),salt,200000).hex(),'signing':secrets.token_bytes(32).hex()}
    with auth.open('x',encoding='utf-8') as stream:json.dump(payload,stream)
    os.chmod(auth,0o600)
print('Owner authentication initialized. Changing .env does not rotate an existing login code.')
