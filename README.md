# Bot Rifa Pro v6.0

Bot profissional de gerenciamento de rifas para WhatsApp.

## Comandos Publicos

| Comando | Descricao |
|---------|-----------|
| `!rifa` / `!status` | Status da rifa |
| `!comprar [numero]` | Comprar numero especifico |
| `!comprar [quantidade]` | Comprar numeros aleatorios |
| `!meus` | Ver meus numeros |
| `!pago [numero]` | Confirmar pagamento |
| `!pago` | Confirmar todos pendentes |
| `!pix` | Dados de pagamento |
| `!numeros` | Numeros disponiveis |
| `!regras` | Regras da rifa |
| `!ajuda` | Lista de comandos |

## Comandos Admin

| Comando | Descricao |
|---------|-----------|
| `!cobrar` | Cobrar pendentes (menciona) |
| `!todos [mensagem]` | Mencionar todos |
| `!limpar` | Liberar nao pagos (24h) |
| `!sorteio` | Realizar sorteio |
| `!config [campo] [valor]` | Configurar rifa |
| `!admin [numero]` | Adicionar admin |
| `!reset` | Resetar rifa (backup automatico) |

## Configuracao

Primeiro a usar `!config` vira admin automatico.

Campos de config:
- `titulo` - Nome da rifa
- `preco` - Preco por numero
- `total` - Total de numeros
- `premio` - Descricao do premio
- `sorteio` - Data do sorteio
- `pix` - Chave PIX
- `pixnome` - Nome no PIX

Exemplo:
```
!config titulo Rifa do Carro
!config preco 50
!config total 100
!config premio Carro 0km
!config sorteio 25/12/2024
!config pix 71988140188
!config pixnome Giselle Muniz
```
