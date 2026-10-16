"""Server-side OpenAI-compatible Chat Completions streaming; no tools or agents."""
import json
import os
from urllib.parse import urlsplit

from aiohttp import ClientTimeout


def actor_config(identity):
    prefix='AIROOM_'+identity.upper()+'_'
    # The summary assistant inherits GPT only when none of its own route is set.
    defaults=actor_config('gpt') if identity=='summary' else {k.lower():os.getenv('AIROOM_'+k,'').strip() for k in ['BASE_URL','API_KEY','MODEL']}
    return {k.lower():(os.getenv(prefix+k) or defaults[k.lower()]).strip() for k in ['BASE_URL','API_KEY','MODEL']}


def extract_text(value):
    if isinstance(value,str):return value
    if isinstance(value,list):return ''.join(x.get('text','') for x in value if isinstance(x,dict) and isinstance(x.get('text'),str))
    return ''


async def stream_completion(session,config,messages):
    base=config['base_url'].rstrip('/')
    if not base or not config['model']:raise ValueError('请在服务端 .env 配置此角色的 BASE_URL 和 MODEL，然后重启工作室')
    parsed=urlsplit(base)
    if parsed.scheme not in ['http','https'] or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('模型 BASE_URL 必须是 http/https 服务根路径，不能含内嵌凭据或查询参数')
    headers={'Content-Type':'application/json','Accept':'text/event-stream'}
    if config['api_key']:headers['Authorization']='Bearer '+config['api_key']
    payload={'model':config['model'],'messages':messages,'stream':True}
    async with session.post(base+'/chat/completions',headers=headers,json=payload,allow_redirects=False,
                            timeout=ClientTimeout(total=145,sock_read=90)) as response:
        if response.status!=200:
            # Do not relay upstream bodies: they can contain account or credential details.
            raise ValueError('模型服务返回 HTTP '+str(response.status)+'，请检查配置、额度和服务状态')
        if 'application/json' in response.headers.get('Content-Type',''):
            data=await response.json();choices=data.get('choices') or []
            if not choices:raise ValueError('模型服务未返回有效回复')
            if choices[0].get('finish_reason') in ['length','content_filter']:raise ValueError('模型回复未完整完成，请缩小问题后重试')
            yield extract_text(choices[0].get('message',{}).get('content'))
            return
        completed=False;events=[];buffer=b''
        def parse_event(lines):
            raw='\n'.join(lines)
            if raw=='[DONE]':return None,True
            try:event=json.loads(raw)
            except ValueError:raise ValueError('模型返回了无法解析的流式数据') from None
            if event.get('error'):raise ValueError('模型服务在流式响应中返回错误')
            choices=event.get('choices') or []
            if not choices:return '',False
            choice=choices[0]
            if choice.get('finish_reason')=='length':raise ValueError('模型回复达到输出上限，请缩小问题重试')
            if choice.get('finish_reason')=='content_filter':raise ValueError('模型服务过滤了回复')
            return extract_text(choice.get('delta',{}).get('content')),choice.get('finish_reason') is not None
        async for chunk in response.content.iter_any():
            buffer+=chunk
            if len(buffer)>2*1024*1024:raise ValueError('流式数据行过长')
            while b'\n' in buffer:
                raw,buffer=buffer.split(b'\n',1);line=raw.rstrip(b'\r').decode('utf-8')
                if not line:
                    if events:
                        text,done=parse_event(events);events=[];completed|=done
                        if text:yield text
                elif line.startswith('data:'):
                    events.append(line[5:].lstrip(' '))
                    if sum(len(x) for x in events)>2*1024*1024:raise ValueError('流式事件过长')
        if buffer.startswith(b'data:'):events.append(buffer[5:].strip().decode('utf-8'))
        if events:
            text,done=parse_event(events);completed|=done
            if text:yield text
        if not completed:raise ValueError('模型流提前断开，未收到完成标记，请重试')
