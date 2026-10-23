/* SPDX-License-Identifier: GPL-3.0-or-later
 * Persistent, application-owned WFP policy. No global firewall resets.
 * Soft permits in our sublayer never override another provider's blocks.
 */
#define _WIN32_WINNT 0x0A00
#define WIN32_LEAN_AND_MEAN
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <winsock2.h>
#include <windows.h>
#include <initguid.h>
#include <fwpmu.h>
#include <iphlpapi.h>
#include <netioapi.h>
#include <stdio.h>
#include <stdint.h>
#include <wchar.h>
#include <stdlib.h>

static const GUID providerKey = {0xf686dba8,0x0412,0x494a,{0xa3,0x55,0x70,0x68,0xc7,0x0e,0x55,0x4b}};
static const GUID sublayerKey = {0x933602e3,0x4216,0x44ab,{0xb4,0x5a,0x78,0xba,0xfb,0x79,0x4b,0x35}};
static const GUID *layers[] = {&FWPM_LAYER_ALE_AUTH_CONNECT_V4,&FWPM_LAYER_ALE_AUTH_CONNECT_V6,
    &FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4,&FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V6};
static HANDLE engine;
static UINT64 context;
static DWORD lastCode;
static const char *lastStage = "initialization";
static DWORD check(DWORD code, const char *stage) {
    if (code) { lastCode=code; lastStage=stage; }
    return code;
}
static DWORD listFilters(BOOL remove, UINT32 *count, UINT64 *policy) {
    FWPM_FILTER_ENUM_TEMPLATE0 query={0};
    *count=0; *policy=0;
    FWPM_PROVIDER0 *provider=NULL;
    DWORD code=FwpmProviderGetByKey0(engine,&providerKey,&provider);
    if(code==(DWORD)FWP_E_PROVIDER_NOT_FOUND)return ERROR_SUCCESS;
    if(code)return check(code,"provider-status");
    FwpmFreeMemory0((void**)&provider);
    query.providerKey=(GUID*)&providerKey;
    query.enumType=FWP_FILTER_ENUM_FULLY_CONTAINED;
    query.actionMask=0xFFFFFFFF;
    query.flags=FWP_FILTER_ENUM_FLAG_INCLUDE_DISABLED;
    /* A non-NULL enumeration template requires a concrete layer GUID.
       Enumerate our four ALE layers individually, never unrelated policies. */
    for(UINT32 layer=0;layer<4;layer++) {
        HANDLE enumeration=NULL;
        query.layerKey=*layers[layer];
        code=check(FwpmFilterCreateEnumHandle0(engine,&query,&enumeration),"enumerate-create");
        if(code)return code;
        for(;;) {
            FWPM_FILTER0 **entries=NULL;UINT32 size=0;
            code=check(FwpmFilterEnum0(engine,enumeration,128,&entries,&size),"enumerate");
            if(code)break;
            for(UINT32 i=0;i<size;i++) {
                if(!IsEqualGUID(&entries[i]->subLayerKey,&sublayerKey))continue;
                if(*count==0)*policy=entries[i]->rawContext;
                else if(*policy!=entries[i]->rawContext)*policy=0;
                if(entries[i]->flags & FWPM_FILTER_FLAG_DISABLED)*policy=0;
                (*count)++;
                if(remove && (code=check(FwpmFilterDeleteById0(engine,entries[i]->filterId),"delete-owned-filter")))break;
            }
            FwpmFreeMemory0((void**)&entries);
            if(code || size<128)break;
        }
        FwpmFilterDestroyEnumHandle0(engine,enumeration);
        if(code)return code;
    }
    return ERROR_SUCCESS;
}
static DWORD addFilter(const GUID *layer, FWP_ACTION_TYPE action, UINT64 weight,
        FWPM_FILTER_CONDITION0 *conditions, UINT32 count, const wchar_t *name) {
    FWPM_FILTER0 filter={0};
    filter.displayData.name=(wchar_t*)name;
    filter.layerKey=*layer;filter.subLayerKey=sublayerKey;
    filter.providerKey=(GUID*)&providerKey;
    filter.flags=FWPM_FILTER_FLAG_PERSISTENT;
    filter.action.type=action;
    filter.weight.type=FWP_UINT64;filter.weight.uint64=&weight;
    filter.filterCondition=conditions;filter.numFilterConditions=count;
    filter.rawContext=context;
    return check(FwpmFilterAdd0(engine,&filter,NULL,NULL),"add-filter");
}
static FWPM_FILTER_CONDITION0 condition(const GUID *field, FWP_DATA_TYPE type) {
    FWPM_FILTER_CONDITION0 value={0};value.fieldKey=*field;
    value.matchType=FWP_MATCH_EQUAL;value.conditionValue.type=type;return value;
}
static DWORD appRule(const GUID *layer,const wchar_t *file,FWP_ACTION_TYPE action,UINT64 weight) {
    FWP_BYTE_BLOB *appId=NULL;
    DWORD code=check(FwpmGetAppIdFromFileName0(file,&appId),"application-identity");
    if(code)return code;
    FWPM_FILTER_CONDITION0 c=condition(&FWPM_CONDITION_ALE_APP_ID,FWP_BYTE_BLOB_TYPE);
    c.conditionValue.byteBlob=appId;
    code=addFilter(layer,action,weight,&c,1,L"Azadi Connect: application");
    FwpmFreeMemory0((void**)&appId);
    return code;
}
static DWORD read32(const BYTE *bytes,size_t size,size_t *offset,UINT32 *value) {
    if(*offset>size || size-*offset<4)return ERROR_INVALID_DATA;
    memcpy(value,bytes+*offset,4);*offset+=4;return ERROR_SUCCESS;
}
static DWORD readPolicy(const wchar_t *file,UINT32 *mode,UINT32 *count,wchar_t ***apps) {
    FILE *input=_wfopen(file,L"rb");if(!input)return check(ERROR_FILE_NOT_FOUND,"policy-open");
    fseek(input,0,SEEK_END);long length=ftell(input);rewind(input);
    if(length<16 || length>2*1024*1024){fclose(input);return check(ERROR_INVALID_DATA,"policy-size");}
    BYTE *bytes=(BYTE*)calloc((size_t)length,1);
    if(!bytes){fclose(input);return check(ERROR_OUTOFMEMORY,"policy-memory");}
    size_t size=fread(bytes,1,(size_t)length,input);fclose(input);size_t offset=8;
    DWORD code=ERROR_INVALID_DATA;
    if(size!=(size_t)length || memcmp(bytes,"AZADIKS1",8))goto done;
    if(read32(bytes,size,&offset,mode) || read32(bytes,size,&offset,count))goto done;
    if((*mode!=1 && *mode!=2) || *count>500 || (*mode==2 && !*count))goto done;
    *apps=(wchar_t**)calloc((size_t)*count+1,sizeof(wchar_t*));
    if(!*apps){code=ERROR_OUTOFMEMORY;goto done;}
    for(UINT32 i=0;i<*count;i++) {
        UINT32 chars=0;
        if(read32(bytes,size,&offset,&chars) || chars<7 || chars>32760 || offset>size || chars>(size-offset)/2)goto done;
        (*apps)[i]=(wchar_t*)calloc((size_t)chars+1,sizeof(wchar_t));
        if(!(*apps)[i]){code=ERROR_OUTOFMEMORY;goto done;}
        memcpy((*apps)[i],bytes+offset,(size_t)chars*2);offset+=(size_t)chars*2;
        if(wcslen((*apps)[i])!=chars || (*apps)[i][1]!=L':' || (*apps)[i][2]!=L'\\'
            || _wcsicmp((*apps)[i]+chars-4,L".exe"))goto done;
    }
    if(offset==size)code=ERROR_SUCCESS;
done:
    free(bytes);return check(code,"policy-parse");
}
static DWORD arm(UINT32 mode,UINT32 count,wchar_t **apps) {
    wchar_t core[32768],svchost[MAX_PATH];DWORD n=GetModuleFileNameW(NULL,core,32768);
    if(!n || n>=32768)return check(ERROR_INSUFFICIENT_BUFFER,"engine-path");
    wchar_t *slash=wcsrchr(core,L'\\');if(!slash)return check(ERROR_INVALID_NAME,"engine-path");
    if((size_t)(slash-core)+14>=32768)return check(ERROR_INSUFFICIENT_BUFFER,"engine-path");
    wcscpy(slash+1,L"sing-box.exe");
    n=GetSystemDirectoryW(svchost,MAX_PATH);
    if(!n || n>MAX_PATH-14)return check(ERROR_INVALID_NAME,"system-path");
    wcscat(svchost,L"\\svchost.exe");
    NET_LUID tun={0};
    /* Missing adapter means block first. A second atomic arm after startup
       inserts its actual LUID; a guessed interface name is never permitted. */
    ConvertInterfaceAliasToLuid(L"AzadiConnect",&tun);
    UINT32 expected=4*(3+(tun.Value?1:0)+(mode==1?3:count+2));
    context=((UINT64)expected<<32)|mode;
    DWORD code=check(FwpmTransactionBegin0(engine,0),"transaction-begin");
    if(code)return code;
    FWPM_PROVIDER0 provider={0};provider.providerKey=providerKey;
    provider.displayData.name=L"Azadi Connect network lock";provider.flags=FWPM_PROVIDER_FLAG_PERSISTENT;
    code=FwpmProviderAdd0(engine,&provider,NULL);
    if(code && code!=FWP_E_ALREADY_EXISTS){check(code,"provider");goto abort;}
    FWPM_SUBLAYER0 sublayer={0};sublayer.subLayerKey=sublayerKey;
    sublayer.displayData.name=L"Azadi Connect network lock";sublayer.providerKey=(GUID*)&providerKey;
    sublayer.flags=FWPM_SUBLAYER_FLAG_PERSISTENT;sublayer.weight=0xFFFF;
    code=FwpmSubLayerAdd0(engine,&sublayer,NULL);
    if(code && code!=FWP_E_ALREADY_EXISTS){check(code,"sublayer");goto abort;}
    UINT32 removed;UINT64 oldPolicy;
    if((code=listFilters(TRUE,&removed,&oldPolicy)))goto abort;
    for(UINT32 i=0;i<4;i++) {
        FWPM_FILTER_CONDITION0 c[4];
        c[0]=condition(&FWPM_CONDITION_FLAGS,FWP_UINT32);
        c[0].matchType=FWP_MATCH_FLAGS_ALL_SET;c[0].conditionValue.uint32=FWP_CONDITION_FLAG_IS_LOOPBACK;
        if((code=addFilter(layers[i],FWP_ACTION_PERMIT,100,c,1,L"Azadi Connect: loopback")))goto abort;
        if((code=appRule(layers[i],core,FWP_ACTION_PERMIT,90)))goto abort;
        if(tun.Value) {
            c[0]=condition(&FWPM_CONDITION_IP_LOCAL_INTERFACE,FWP_UINT64);c[0].conditionValue.uint64=&tun.Value;
            if((code=addFilter(layers[i],FWP_ACTION_PERMIT,80,c,1,L"Azadi Connect: VPN interface")))goto abort;
        }
        /* DHCP only for Windows' service host and the protocol's exact ports.
           This does not give ordinary programs an extra physical-network bypass. */
        FWP_BYTE_BLOB *service=NULL;
        if((code=check(FwpmGetAppIdFromFileName0(svchost,&service),"dhcp-identity")))goto abort;
        c[0]=condition(&FWPM_CONDITION_ALE_APP_ID,FWP_BYTE_BLOB_TYPE);c[0].conditionValue.byteBlob=service;
        c[1]=condition(&FWPM_CONDITION_IP_PROTOCOL,FWP_UINT8);c[1].conditionValue.uint8=IPPROTO_UDP;
        c[2]=condition(&FWPM_CONDITION_IP_LOCAL_PORT,FWP_UINT16);c[2].conditionValue.uint16=(i%2)?546:68;
        c[3]=condition(&FWPM_CONDITION_IP_REMOTE_PORT,FWP_UINT16);c[3].conditionValue.uint16=(i%2)?547:67;
        code=addFilter(layers[i],FWP_ACTION_PERMIT,70,c,4,L"Azadi Connect: DHCP");
        FwpmFreeMemory0((void**)&service);if(code)goto abort;
        if(mode==1) {
            /* Essential IPv6 neighbor discovery, no general ICMP/TCP/UDP bypass.
               ALE uses local-port for ICMP type and remote-port for its code. */
            for(UINT16 type=133;type<=136;type++) {
                if(!(i%2))break;
                c[0]=condition(&FWPM_CONDITION_IP_PROTOCOL,FWP_UINT8);c[0].conditionValue.uint8=IPPROTO_ICMPV6;
                c[1]=condition(&FWPM_CONDITION_IP_LOCAL_PORT,FWP_UINT16);c[1].conditionValue.uint16=type;
                c[2]=condition(&FWPM_CONDITION_IP_REMOTE_PORT,FWP_UINT16);c[2].conditionValue.uint16=0;
                if((code=addFilter(layers[i],FWP_ACTION_PERMIT,60,c,3,L"Azadi Connect: IPv6 neighbor discovery")))goto abort;
            }
            if((code=addFilter(layers[i],FWP_ACTION_BLOCK,1,NULL,0,L"Azadi Connect: block physical traffic")))goto abort;
        } else {
            for(UINT32 j=0;j<count;j++)if((code=appRule(layers[i],apps[j],FWP_ACTION_BLOCK,10)))goto abort;
            /* Windows' shared ordinary DNS is protected globally in app mode.
               DoH in an unselected application follows that application's scope. */
            for(UINT16 port=53;port<=853;port+=800) {
                c[0]=condition(&FWPM_CONDITION_IP_REMOTE_PORT,FWP_UINT16);c[0].conditionValue.uint16=port;
                if((code=addFilter(layers[i],FWP_ACTION_BLOCK,5,c,1,L"Azadi Connect: ordinary DNS")))goto abort;
            }
        }
    }
    return check(FwpmTransactionCommit0(engine),"transaction-commit");
abort:
    FwpmTransactionAbort0(engine);return code;
}
int wmain(int argc,wchar_t **argv) {
    if(argc<2)return 64;
    FWPM_SESSION0 session={0};session.displayData.name=L"Azadi Connect policy manager";
    DWORD code=check(FwpmEngineOpen0(NULL,RPC_C_AUTHN_WINNT,NULL,&session,&engine),"open-wfp");
    if(!code) {
        if(!wcscmp(argv[1],L"status")) {
            UINT32 count;UINT64 policy;code=listFilters(FALSE,&count,&policy);
            if(!code)printf("{\"active\":%s,\"mode\":\"%s\",\"filters\":%u,\"complete\":%s}\n",count?"true":"false",(policy&0xFFFFFFFF)==1?"system":"apps",count,(!count || (policy>>32)==count)?"true":"false");
        } else if(!wcscmp(argv[1],L"unlock")) {
            code=check(FwpmTransactionBegin0(engine,0),"unlock-begin");
            if(!code) {
                UINT32 count;UINT64 policy;code=listFilters(TRUE,&count,&policy);
                if(code)FwpmTransactionAbort0(engine);
                else code=check(FwpmTransactionCommit0(engine),"unlock-commit");
            }
            if(!code)puts("{\"active\":false,\"filters\":0}");
        } else if(argc==3 && !wcscmp(argv[1],L"arm")) {
            UINT32 mode=0,count=0;wchar_t **apps=NULL;
            code=readPolicy(argv[2],&mode,&count,&apps);
            if(!code)code=arm(mode,count,apps);
            if(apps){for(UINT32 i=0;i<count;i++)free(apps[i]);free(apps);}
            if(!code)puts("{\"active\":true}");
        } else code=check(ERROR_INVALID_PARAMETER,"arguments");
        FwpmEngineClose0(engine);
    }
    if(code)fprintf(stderr,"network-lock: %s failed (Windows/WFP code 0x%08lX)\n",lastStage,lastCode);
    return code?1:0;
}
