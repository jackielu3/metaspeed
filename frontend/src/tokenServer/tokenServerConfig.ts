type TokenServerConfig = {
    tokenServer: string
}

const production = 'https://metaspeed-tokenserver.babbage.systems'
const local = 'https://2ae8a435e888.ngrok-free.app'

const override = new URLSearchParams(window.location.search).get('tokenServer')

let config: TokenServerConfig

if (override)
{
    config = {
        tokenServer: override
    }
}
else
{
    if (window.location.host.startsWith('localhost'))
    {
        config = {
            tokenServer: local
        }
    }
    else
    {
        config = {
            tokenServer: production
        }
    }
}

export const TOKEN_SERVER = config.tokenServer
export const ADMIN_IDENTITY_KEY = '025a2cb22976ff42743e4b168f853021b1042aa392792743d60b1234e9d5de5efe'
