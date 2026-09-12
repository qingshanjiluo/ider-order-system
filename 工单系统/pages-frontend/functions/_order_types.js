// _order_types.js — 工单类型白名单
//
// 平台只保留「购买邀请积分」这一种工单；其余类型（仙盟采集 / 试炼测试 /
// 每日试炼 / 传人派出 / 副本刷取）已下线，任何写入与读取路径都必须拒绝。
//
// 历史数据里邀请积分工单分别以 代练 / 代打 / 托管 三个字符串落库，
// 三者语义完全相同，统一视为邀请积分工单。

export const INVITE_ORDER_TYPES = ['代练', '代打', '托管'];

// 邀请积分工单的规范类型（历史三种写法归一）
export const CANONICAL_ORDER_TYPE = '代练';

// 空值 / NULL 视为默认类型（历史 INSERT 缺省即 代练）
export function isInviteOrderType(orderType) {
  if (orderType === undefined || orderType === null || orderType === '') return true;
  return INVITE_ORDER_TYPES.includes(orderType);
}

// 归一化：把历史写法折叠成规范类型；非邀请积分工单返回 null
export function normalizeOrderType(orderType) {
  return isInviteOrderType(orderType) ? CANONICAL_ORDER_TYPE : null;
}

// SQL WHERE 片段：只匹配邀请积分工单（含历史 NULL/空值），需配合别名 o 使用
export const INVITE_ORDER_TYPE_SQL =
  "(o.order_type IS NULL OR o.order_type = '' OR o.order_type IN ('代练','代打','托管'))";
