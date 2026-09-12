const API_BASE = '/api';

const api = {
  // Request deduplication cache
  _pendingRequests: new Map(),
  
  // Default timeout (10 seconds)
  _defaultTimeout: 10000,
  
  // Max retries for failed requests
  _maxRetries: 3,

  async request(method, path, data = null, options = {}) {
    const { timeout = this._defaultTimeout, retries = this._maxRetries, skipCache = false } = options;
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const reqOptions = { method, headers };
    if (data) reqOptions.body = JSON.stringify(data);

    // Request deduplication for GET requests
    const cacheKey = method === 'GET' ? `${method}:${path}:${JSON.stringify(data || {})}` : null;
    if (cacheKey && !skipCache) {
      const pending = this._pendingRequests.get(cacheKey);
      if (pending) {
        return pending;
      }
    }

    const executeRequest = async (attempt = 0) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(`${API_BASE}${path}`, {
          ...reqOptions,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        // P3（轮49）：**状态码语义必须穿过传输层**，不能退化成一行文本。
        // 后端早就在发结构化的拒绝理由 —— 423 账号锁定（loginGuard，带 retryAfterSeconds）、
        // 429 接口限流（tierLimit / rateLimit，带 retryAfterSeconds 与 scope）、
        // 501 尚未实装（技能隐藏解锁）、409 状态冲突（大限劫）。
        // 而这里以前是 `throw new Error(result.error)`：调用方拿不到 status，于是
        // "过一会儿再来" 和 "你前置条件不够" 在界面上长得一模一样，玩家只能反复点。
        // 另外原来无条件 `response.json()`：一旦后端返回非 JSON（反代/静态兜底）整个请求就抛解析异常。
        let payload = null;
        const text = await response.text();
        try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = null; }
        if (!response.ok) {
          const status = response.status;
          const err = new Error((payload && payload.error) || `HTTP ${status}`);
          err.status = status;
          err.payload = payload;
          err.kind = status === 401 ? 'unauthorized'
            : status === 403 ? 'forbidden'
            : status === 409 ? 'conflict'
            : status === 423 ? 'accountLocked'
            : status === 429 ? 'rateLimited'
            : status === 501 ? 'notImplemented'
            : status >= 500 ? 'server' : 'client';
          const headerRetry = Number(response.headers.get('retry-after')) || 0;
          const ra = payload && payload.retryAfterSeconds ? Number(payload.retryAfterSeconds) : headerRetry;
          if (ra > 0) err.retryAfterSeconds = ra;
          if (payload && payload.scope) err.scope = payload.scope;
          err.unauthorized = status === 401;
          err.locked = status === 423;
          err.tooManyRequests = status === 429;
          err.conflict = status === 409;
          err.notImplemented = status === 501;
          throw err;
        }
        return payload;
      } catch (error) {
        clearTimeout(timeoutId);
        // Retry on network errors (not on 4xx errors)
        if (attempt < retries && (error.name === 'AbortError' || error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          return executeRequest(attempt + 1);
        }
        throw error;
      }
    };

    const promise = executeRequest();
    
    if (cacheKey) {
      this._pendingRequests.set(cacheKey, promise);
      promise.finally(() => this._pendingRequests.delete(cacheKey));
    }
    
    return promise;
  },

  // P3（轮49）：把传输层错误翻译成玩家看得懂的一句话。
  // 面板统一走它，别再各自 `e.message.slice(0, 20)` —— 那正是"423 和 429 长一个样"的第二个来源。
  errInfo(error) {
    const kind = (error && error.kind) || 'client';
    const ra = error && error.retryAfterSeconds ? Math.ceil(Number(error.retryAfterSeconds)) : 0;
    const base = (error && error.message) || '操作失败';
    if (kind === 'rateLimited') return { kind, retryAfterSeconds: ra, text: `手太快了：${base}${ra ? `（约 ${ra} 秒后再试）` : ''}` };
    if (kind === 'accountLocked') return { kind, retryAfterSeconds: ra, text: `账号暂时锁定：${base}` };
    if (kind === 'unauthorized') return { kind, text: '登录已失效，请重新登录' };
    if (kind === 'notImplemented') return { kind, text: `${base}（需要服务端记录的机缘，暂不可自助解锁）` };
    if (kind === 'conflict') return { kind, text: `${base}（状态已变化，请刷新后重试）` };
    if (kind === 'forbidden') return { kind, text: `此刻不可用：${base}` };
    if (kind === 'server') return { kind, text: `服务器忙：${base}` };
    return { kind, text: base };
  },

  // —— P2 好友与洞府拜访（后端轮48 上线，界面此前零引用 ⇒ 本轮接线）——
  async getFriends() { return this.request('GET', '/friend/list'); },
  async searchCharacters(name) { return this.request('GET', `/friend/search?name=${encodeURIComponent(name || '')}`); },
  async requestFriend(target) { return this.request('POST', '/friend/request', { target }); },
  async respondFriend(requestId, accept) { return this.request('POST', '/friend/respond', { requestId, accept: !!accept }); },
  async removeFriend(friendId) { return this.request('POST', '/friend/remove', { friendId }); },
  async visitFriendCave(hostId) { return this.request('POST', '/friend/visit', { hostId }); },

  // —— P3（轮50）突破面板：概率构成 / 契机丹 / 失败折寿预告 / 掉落保底，一次取全 ——
  async getBreakthroughPanel() { return this.request('GET', '/cultivation/can-breakthrough'); },

  // —— P2 市场 7 日成交价与指导价 ——
  async getMarketPrices(item) { return this.request('GET', item ? `/market/prices?item=${encodeURIComponent(item)}` : '/market/prices'); },

  // GET with automatic caching
  async get(path, options = {}) {
    return this.request('GET', path, null, options);
  },

  // POST without deduplication
  async post(path, data, options = {}) {
    return this.request('POST', path, data, { ...options, skipCache: true });
  },

  async login(username, password, turnstileToken) {
    return this.post('/auth/login', { username, password, turnstileToken });
  },

  async register(username, password, nickname, faction, turnstileToken) {
    return this.post('/auth/register', { username, password, nickname, faction, turnstileToken });
  },

  async getCharacter() {
    return this.get('/character');
  },

  async updateCharacter(name) {
    return this.post('/character', { name });
  },

  async getStats() {
    return this.get('/character/stats');
  },

  async getEquipments() {
    return this.get('/character/equipments');
  },

  async getGongfa() {
    return this.get('/character/gongfa');
  },

  async getPets() {
    return this.get('/character/pets');
  },

  async getInventory() {
    return this.get('/character/inventory');
  },

  async getRealm() {
    return this.request('GET', '/cultivation/realm');
  },

  async getRealms() {
    return this.request('GET', '/game/realms');
  },

  async getMaps() {
    return this.request('GET', '/game/maps');
  },

  async getDungeonList() {
    return this.request('GET', '/dungeon/list');
  },

  async getDungeons() {
    return this.request('GET', '/game/dungeons');
  },

  async getItems() {
    return this.request('GET', '/game/items');
  },

  async getGuilds() {
    return this.request('GET', '/game/guilds');
  },

  async getCultivationStatus() {
    return this.request('GET', '/cultivation/status');
  },

  async train() {
    return this.request('POST', '/cultivation/train');
  },

  async trainOffline(hours) {
    return this.request('POST', '/cultivation/train-offline', { hours });
  },

  async breakthrough() {
    return this.request('POST', '/cultivation/breakthrough');
  },

  async claimOffline() {
    return this.request('POST', '/cultivation/claim-offline');
  },

  async getEnemy() {
    return this.request('GET', '/battle/enemy');
  },

  async battle(mapId, skillIndex) {
    return this.request('POST', '/battle/battle', { mapId, skillIndex });
  },

  async equipItem(itemId, slot) {
    return this.request('POST', '/equipment/equip', { itemId, slot });
  },

  async unequipItem(slot) {
    return this.request('POST', '/equipment/unequip', { slot });
  },

  async enhanceEquipment(equipmentId) {
    return this.request('POST', '/equipment/enhance', { equipmentId });
  },

  async generateEquipment(realm, quality) {
    return this.request('POST', '/equipment/generate', { realm, quality });
  },

  async equipGongfa(itemId, type, slot) {
    return this.request('POST', '/gongfa/equip', { itemId, type, slot });
  },

  async unequipGongfa(type, slot) {
    return this.request('POST', '/gongfa/unequip', { type, slot });
  },

  async generateGongfa(realm, quality, type) {
    return this.request('POST', '/gongfa/generate', { realm, quality, type });
  },

  async upgradeGongfa(gongfaId) {
    return this.request('POST', '/gongfa/upgrade', { gongfaId });
  },

  async getMySkills() {
    return this.request('GET', '/skill/list');
  },

  async getAllSkills() {
    return this.request('GET', '/skill/all');
  },

  async getEquipmentSlots() {
    return this.request('GET', '/equipment/slots');
  },

  async getSkillShop() {
    return this.request('GET', '/skill/shop');
  },

  async learnSkill(skillId) {
    return this.request('POST', '/skill/learn', { skillId });
  },

  async upgradeSkill(playerSkillId) {
    return this.request('POST', '/skill/upgrade', { playerSkillId });
  },

  async equipSkill(playerSkillId, slot) {
    return this.request('POST', '/skill/equip', { playerSkillId, slot });
  },

  async unequipSkill(playerSkillId) {
    return this.request('POST', '/skill/unequip', { playerSkillId });
  },

  async forgetSkill(playerSkillId) {
    return this.request('POST', '/skill/forget', { playerSkillId });
  },

  async synthesizeSkills(skillId1, skillId2) {
    return this.request('POST', '/skill/synthesize', { skillId1, skillId2 });
  },

  async buySkillBook(skillId) {
    return this.request('POST', '/skill/buy', { skillId });
  },

  // 轮47 起服务端**不再接受客户端自报解锁条件**（那等于任何登录玩家 POST 一个 truthy 值就白拿仙阶大招），
  // 现在固定返回 501 并说明需要服务端记录的机缘。所以这里不再发送 condition，
  // 界面侧也只允许呈现"需机缘解锁"的说明，不许再放一个必然失败的按钮。
  async unlockHiddenSkill(skillId) {
    return this.request('POST', '/skill/unlock-hidden', { skillId });
  },

  // P1：功法书研读（后端轮46 就实现了 /gongfa/study，前端一直零引用 ⇒ 本轮接线）。
  // 注意 itemId 传的是**物品定义 id**，服务端自己去背包里找并扣除。
  async studyGongfaBook(itemId) {
    return this.request('POST', '/gongfa/study', { itemId });
  },

  async getSkillElements() {
    return this.request('GET', '/skill/elements');
  },

  async equipPet(petId) {
    return this.request('POST', '/pet/equip', { petId });
  },

  async unequipPet(petId) {
    return this.request('POST', '/pet/unequip', { petId });
  },

  async generatePet(realm, quality) {
    return this.request('POST', '/pet/generate', { realm, quality });
  },

  async feedPet(petId, foodType, quantity) {
    return this.request('POST', '/pet/feed', { petId, foodType, quantity });
  },

  async getForgeRecipes() {
    return this.request('GET', '/forge/recipes');
  },

  async forgeItem(recipeId) {
    return this.request('POST', '/forge/craft', { recipeId });
  },

  async getForgeForgeRecipes() {
    return this.request('GET', '/forge/forge-recipes');
  },

  async forgeEquipment(recipeId) {
    return this.request('POST', '/forge/forge', { recipeId });
  },

  async getAlchemyRecipes() {
    return this.request('GET', '/alchemy/recipes');
  },

  async craftPill(recipeId, useAux, useCatalyst) {
    return this.request('POST', '/alchemy/craft', { recipeId, useAux, useCatalyst });
  },

  async practiceAlchemy(recipeId, hours) {
    return this.request('POST', '/alchemy/practice', { recipeId, hours });
  },

  async refinePill(itemId) {
    return this.request('POST', '/alchemy/refine-pill', { itemId });
  },

  async dissolvePill(itemId) {
    return this.request('POST', '/alchemy/dissolve', { itemId });
  },

  async getAlchemyInfo() {
    return this.request('GET', '/alchemy/info');
  },

  async upgradeFurnace() {
    return this.request('POST', '/alchemy/upgrade-furnace');
  },

  async unlockAlchemyTalent(talentId) {
    return this.request('POST', '/alchemy/unlock-talent', { talentId });
  },

  async getAlchemyProficiency() {
    return this.request('GET', '/alchemy/proficiency');
  },

  async getRefineInfo() {
    return this.request('GET', '/forge-systems/refine-info');
  },

  async refineItem(targetId, targetType) {
    return this.request('POST', '/forge-systems/refine', { targetId: String(targetId), targetType });
  },

  async getBlueprints() {
    return this.request('GET', '/forge-systems/blueprints');
  },

  async unlockBlueprint(blueprintId) {
    return this.request('POST', '/forge-systems/blueprint/unlock', { blueprintId });
  },

  async getCodex() {
    return this.request('GET', '/forge-systems/codex');
  },

  async unlockCodex(entryId) {
    return this.request('POST', '/forge-systems/codex/unlock', { entryId });
  },

  async getAffixes() {
    return this.request('GET', '/forge-systems/affixes');
  },

  async generateNamedEquipment(slot, quality, affix, style) {
    return this.request('POST', '/forge-systems/generate-named', { slot, quality, affix, style });
  },

  async getShopItems() {
    return this.request('GET', '/shop/items');
  },

  async buyItem(itemId, quantity) {
    return this.request('POST', '/shop/buy', { itemId, quantity });
  },

  async sellItem(inventoryId) {
    return this.request('POST', '/shop/sell', { inventoryId });
  },

  async dungeonBattle(dungeonId) {
    return this.request('POST', '/dungeon/enter', { dungeonId });
  },

  async sweepDungeon(dungeonId, times) {
    return this.request('POST', '/dungeon/sweep', { dungeonId, times });
  },

  async createGuild(name) {
    return this.request('POST', '/guild/create', { name });
  },

  async getGuildInfo() {
    return this.request('GET', '/guild/info');
  },

  async getGuildMembers() {
    return this.request('GET', '/guild/members');
  },

  async getGuildList() {
    return this.request('GET', '/guild/list');
  },

  async joinGuild(guildId) {
    return this.request('POST', '/guild/join', { guildId });
  },

  async leaveGuild() {
    return this.request('POST', '/guild/leave');
  },

  async kickGuildMember(characterId) {
    return this.request('POST', '/guild/kick', { characterId });
  },

  async setGuildRole(characterId, role) {
    return this.request('POST', '/guild/set-role', { characterId, role });
  },

  async donateGuild(amount) {
    return this.request('POST', '/guild/donate', { amount });
  },

  async getGuildShop() {
    return this.request('GET', '/guild/shop');
  },

  async guildShopBuy(itemId) {
    return this.request('POST', '/guild/shop/buy', { itemId });
  },

  async getGuildSkills() {
    return this.request('GET', '/guild/skills');
  },

  async upgradeGuildSkill(skillId) {
    return this.request('POST', '/guild/skill/upgrade', { skillId });
  },

  async getGuildDungeon() {
    return this.request('GET', '/guild/dungeon');
  },

  async enterGuildDungeon() {
    return this.request('POST', '/guild/dungeon/enter');
  },

  async getBattleSkills() {
    return this.request('GET', '/battle/skills');
  },

  async getArenaOpponents() {
    return this.request('GET', '/arena/opponents');
  },

  async getArenaRankings() {
    return this.request('GET', '/arena/rankings');
  },

  async challenge(targetId) {
    return this.request('POST', '/arena/challenge', { targetId });
  },

  async arenaMatch() {
    return this.request('POST', '/arena/match');
  },

  async getArenaSettlement() {
    return this.request('GET', '/arena/settlement');
  },

  async getCheckinStatus() {
    return this.request('GET', '/checkin/status');
  },

  async checkin() {
    return this.request('POST', '/checkin');
  },

  async makeupCheckin(date) {
    return this.request('POST', '/checkin/makeup', { date });
  },

  async getDailyStatus() {
    return this.request('GET', '/checkin/daily');
  },

  async getAchievements() {
    return this.request('GET', '/achievement');
  },

  async getAchievementProgress() {
    return this.request('GET', '/achievement/progress');
  },

  async claimAchievement(achievementId) {
    return this.request('POST', '/achievement/claim', { achievementId });
  },

  async getVipInfo() {
    return this.request('GET', '/vip/info');
  },

  async getVipLevels() {
    return this.request('GET', '/vip/levels');
  },

  async rechargeVip(packageId) {
    return this.request('POST', '/vip/recharge', { packageId });
  },

  async claimVipDaily() {
    return this.request('POST', '/vip/claim-daily');
  },

  async getJadeShop() {
    return this.request('GET', '/vip/jade-shop');
  },

  async buyWithJade(itemId) {
    return this.request('POST', '/vip/jade-buy', { itemId });
  },

  async getRechargeHistory() {
    return this.request('GET', '/vip/recharge-history');
  },

  async getCurrentSeason() {
    return this.request('GET', '/season/current');
  },

  async registerSeason() {
    return this.request('POST', '/season/register');
  },

  async getSeasonRankings() {
    return this.request('GET', '/season/rankings');
  },

  async settleSeason() {
    return this.request('POST', '/season/settle');
  },

  async getAfkStatus() {
    return this.request('GET', '/afk/status');
  },

  async startAfk(mapId) {
    return this.request('POST', '/afk/start', { mapId });
  },

  async stopAfk() {
    return this.request('POST', '/afk/stop');
  },

  async collectAfk() {
    return this.request('POST', '/afk/collect');
  },

  async getWeapons() {
    return this.request('GET', '/systems/weapons');
  },

  async getMyWeapons() {
    return this.request('GET', '/systems/weapons/my');
  },

  async equipWeapon(itemId, slot) {
    return this.request('POST', '/systems/weapons/equip', { itemId, slot });
  },

  async getPills() {
    return this.request('GET', '/systems/pills');
  },

  async getMyPills() {
    return this.request('GET', '/systems/pills/my');
  },

  async usePill(itemId) {
    return this.request('POST', '/systems/pills/use', { itemId });
  },

  // 轮55：通用「使用」（延寿灵植等）。注意这条走的是 /shop/use-item，按**物品名**寻址（既有接口形状）。
  async useItem(itemName) {
    return this.request('POST', '/shop/use-item', { itemName });
  },

  async getMyTalismans() {
    return this.request('GET', '/systems/talismans/my');
  },

  async getMyFormations() {
    return this.request('GET', '/systems/formations/my');
  },

  async getSets() {
    return this.request('GET', '/systems/sets');
  },

  async getGatheringMaps() {
    return this.request('GET', '/gathering/maps');
  },

  async gather(mapId) {
    return this.request('POST', '/gathering/gather', { mapId });
  },

  async huntMonster(monsterId, mapId) {
    return this.request('POST', '/gathering/hunt', { monsterId, mapId });
  },

  async getMonsters(mapId) {
    return this.request('GET', `/gathering/monsters?mapId=${mapId || ''}`);
  },

  // Chat
  async getChatHistory(channel) {
    return this.request('GET', `/chat/history?channel=${channel}`);
  },
  async getChatChannels() {
    return this.request('GET', '/chat/channels');
  },
  async getOnlineCount() {
    return this.request('GET', '/chat/online');
  },

  // Settings
  async getSettings() {
    return this.request('GET', '/settings');
  },
  async updateSettings(settings) {
    return this.request('POST', '/settings', settings);
  },

  // Invite
  async getInviteCode() {
    return this.request('GET', '/invite/code');
  },
  async getInviteStats() {
    return this.request('GET', '/invite/stats');
  },
  async useInviteCode(code) {
    return this.request('POST', '/invite/use', { code });
  },
  async getInviteList() {
    return this.request('GET', '/invite/list');
  },

  // Talismans
  async getTalismans() {
    return this.request('GET', '/talismans');
  },
  async craftTalisman(name) {
    return this.request('POST', '/talismans/craft', { name });
  },
  async useTalisman(talismanId) {
    return this.request('POST', '/talismans/use', { talismanId });
  },

  // Formations
  async getFormations() {
    return this.request('GET', '/formations');
  },
  async activateFormation(formationId) {
    return this.request('POST', '/formations/activate', { formationId });
  },
  async deactivateFormation() {
    return this.request('POST', '/formations/deactivate');
  },

  // Quests
  async getQuests() {
    return this.request('GET', '/quests');
  },
  async acceptQuest(questId) {
    return this.request('POST', '/quests/accept', { questId });
  },
  async completeQuest(questId) {
    return this.request('POST', '/quests/complete', { questId });
  },

  // 阶段9：剧情记年
  async getChronicle() {
    return this.request('GET', '/chronicle');
  },
  async getBiography() {
    return this.request('GET', '/chronicle/biography');
  },
  async enhanceBiography() {
    return this.request('POST', '/chronicle/biography/enhance', {});
  },

  // 阶段10：拍卖行 / 灵石 / 宗门
  async getMarketListings() {
    return this.request('GET', '/market/listings');
  },
  async getMarketMy() {
    return this.request('GET', '/market/my');
  },
  async marketBuy(listingId) {
    return this.request('POST', '/market/buy', { listingId });
  },
  async marketCancel(listingId) {
    return this.request('POST', '/market/cancel', { listingId });
  },
  async getWallet() {
    return this.request('GET', '/economy/wallet');
  },
  async exchange(fromTier, toTier, amount) {
    return this.request('POST', '/economy/exchange', { fromTier, toTier, amount });
  },
  async getSectList() {
    return this.request('GET', '/sect/list');
  },
  async getSectMy() {
    return this.request('GET', '/sect/my');
  },
  async sectJoin(sectId) {
    return this.request('POST', '/sect/join', { sectId });
  },

  // Announcements
  async getAnnouncements() {
    return this.request('GET', '/announcements');
  },
  async getUnreadAnnouncements() {
    return this.request('GET', '/announcements/unread');
  },
  async markAnnouncementsRead() {
    return this.request('POST', '/announcements/read');
  },
  async createAnnouncement(data) {
    return this.request('POST', '/announcements', data);
  },
  async updateAnnouncement(id, data) {
    return this.request('PUT', `/announcements/${id}`, data);
  },
  async deleteAnnouncement(id) {
    return this.request('DELETE', `/announcements/${id}`);
  },

  // Ads
  async getAds() {
    return this.request('GET', '/ads');
  },
  async getAdsAll() {
    return this.request('GET', '/ads/all');
  },
  async rechargePackage(packageId) {
    return this.request('POST', '/ads/recharge', { packageId });
  },
  async createAd(data) {
    return this.request('POST', '/ads', data);
  },
  async updateAd(id, data) {
    return this.request('PUT', `/ads/${id}`, data);
  },
  async deleteAd(id) {
    return this.request('DELETE', `/ads/${id}`);
  },

  // Admin
  async getAdminDashboard() {
    return this.request('GET', '/admin/dashboard');
  },
  async getAdminUsers(page, search) {
    return this.request('GET', `/admin/users?page=${page || 1}&search=${search || ''}`);
  },
  async setAdminUserRole(id, role) {
    return this.request('POST', `/admin/users/${id}/role`, { role });
  },
  async banUser(id) {
    return this.request('POST', `/admin/users/${id}/ban`);
  },
  async addStones(id, amount) {
    return this.request('POST', `/admin/users/${id}/add-stones`, { amount });
  },
  async addJade(id, amount) {
    return this.request('POST', `/admin/users/${id}/add-jade`, { amount });
  },
  async setAdminLevel(id, level, realm) {
    return this.request('POST', `/admin/users/${id}/set-level`, { level, realm });
  },
  async adminAddItem(id, itemId, quantity) {
    return this.request('POST', `/admin/users/${id}/add-item`, { itemId, quantity });
  },
  async getAdminUserDetail(id) {
    return this.request('GET', `/admin/users/${id}/detail`);
  },
  async getAdminItems(search) {
    return this.request('GET', `/admin/items?search=${search || ''}`);
  },
  async getAdminRechargeLogs() {
    return this.request('GET', '/admin/recharge-logs');
  },
  async resetCharacter(userId) {
    return this.request('POST', '/admin/reset-character', { userId });
  },
  async getAdminCharacters(page) {
    return this.request('GET', `/admin/characters?page=${page || 1}`);
  },
  async getAdminChatLogs(limit) {
    return this.request('GET', `/admin/chat-logs?limit=${limit || 100}`);
  },
  async broadcastMessage(content) {
    return this.request('POST', '/admin/broadcast', { content });
  }
};
