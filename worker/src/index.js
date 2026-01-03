/**
 * Cloudflare Worker - 网址提交和管理系统
 * 功能：
 * 1. 处理用户提交的网站表单
 * 2. Admin 用户登录
 * 3. Admin 添加/管理网站
 * 4. 使用 KV 存储数据
 */

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 返回 JSON 响应
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// 返回错误响应
function errorResponse(message, status = 400) {
  return jsonResponse({ success: false, message }, status);
}

// 返回成功响应
function successResponse(data = {}, message = '操作成功') {
  return jsonResponse({ success: true, message, ...data }, 200);
}

// 验证邮箱格式
function isValidEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// 验证 URL 格式
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// 生成简单的 token（生产环境建议使用更安全的方法）
function generateToken() {
  return crypto.randomUUID() + '-' + Date.now();
}

// 验证 Admin Token
async function verifyAdminToken(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const storedToken = await env.ADMIN_KV.get('admin_token');
  
  if (token === storedToken) {
    return true;
  }
  
  return null;
}

// 处理 CORS 预检请求
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// 处理用户提交表单
async function handleSubmit(request, env) {
  try {
    const formData = await request.json();

    // 验证必填字段
    const requiredFields = ['siteName', 'siteUrl', 'category', 'description', 'email'];
    for (const field of requiredFields) {
      if (!formData[field] || !formData[field].trim()) {
        return errorResponse(`请填写${field === 'siteName' ? '网站名称' : field === 'siteUrl' ? '网站地址' : field === 'category' ? '网站分类' : field === 'description' ? '网站描述' : '联系邮箱'}`);
      }
    }

    // 验证 URL 格式
    if (!isValidUrl(formData.siteUrl)) {
      return errorResponse('网址格式不正确');
    }

    // 验证邮箱格式
    if (!isValidEmail(formData.email)) {
      return errorResponse('邮箱格式不正确');
    }

    // 生成提交 ID
    const submissionId = `submission_${Date.now()}_${crypto.randomUUID()}`;
    
    // 准备存储的数据
    const submissionData = {
      id: submissionId,
      siteName: formData.siteName.trim(),
      siteUrl: formData.siteUrl.trim(),
      category: formData.category,
      description: formData.description.trim(),
      keywords: formData.keywords ? formData.keywords.trim() : '',
      logoPath: formData.logoPath ? formData.logoPath.trim() : '', // 保存 logo 路径
      email: formData.email.trim(),
      contact: formData.contact ? formData.contact.trim() : '',
      submitTime: formData.submitTime || new Date().toISOString(),
      status: 'pending', // pending, approved, rejected
      reviewedAt: null,
      reviewedBy: null,
    };

    // 保存到 KV
    await env.SUBMISSIONS_KV.put(submissionId, JSON.stringify(submissionData));
    
    // 添加到待审核列表
    const pendingListKey = 'pending_submissions';
    const pendingList = await env.SUBMISSIONS_KV.get(pendingListKey, 'json') || [];
    pendingList.push(submissionId);
    await env.SUBMISSIONS_KV.put(pendingListKey, JSON.stringify(pendingList));

    return successResponse({ submissionId }, '提交成功，我们会尽快审核您的网站');
  } catch (error) {
    return errorResponse('服务器错误，请稍后重试', 500);
  }
}

// Admin 登录
async function handleAdminLogin(request, env) {
  try {
    const { username, password } = await request.json();

    // 从环境变量或 KV 获取管理员凭据
    const adminUsername = env.ADMIN_USERNAME || 'admin';
    const adminPassword = env.ADMIN_PASSWORD || 'admin123'; // 生产环境请使用强密码

    if (username !== adminUsername || password !== adminPassword) {
      return errorResponse('用户名或密码错误', 401);
    }

    // 生成 token
    const token = generateToken();
    
    // 保存 token 到 KV
    await env.ADMIN_KV.put('admin_token', token);
    await env.ADMIN_KV.put('admin_token_expiry', (Date.now() + 24 * 60 * 60 * 1000).toString()); // 24小时过期

    return successResponse({ token }, '登录成功');
  } catch (error) {
    return errorResponse('登录失败，请稍后重试', 500);
  }
}

// 获取所有提交（Admin）
async function handleGetSubmissions(request, env) {
  const isAuthenticated = await verifyAdminToken(request, env);
  if (!isAuthenticated) {
    return errorResponse('未授权访问', 401);
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'all';
    
    const pendingListKey = 'pending_submissions';
    const approvedListKey = 'approved_submissions';
    const rejectedListKey = 'rejected_submissions';

    let submissionIds = [];
    
    if (status === 'pending') {
      submissionIds = await env.SUBMISSIONS_KV.get(pendingListKey, 'json') || [];
    } else if (status === 'approved') {
      submissionIds = await env.SUBMISSIONS_KV.get(approvedListKey, 'json') || [];
    } else if (status === 'rejected') {
      submissionIds = await env.SUBMISSIONS_KV.get(rejectedListKey, 'json') || [];
    } else {
      // 获取所有
      const pending = await env.SUBMISSIONS_KV.get(pendingListKey, 'json') || [];
      const approved = await env.SUBMISSIONS_KV.get(approvedListKey, 'json') || [];
      const rejected = await env.SUBMISSIONS_KV.get(rejectedListKey, 'json') || [];
      submissionIds = [...pending, ...approved, ...rejected];
    }

    // 获取所有提交详情
    const submissions = [];
    for (const id of submissionIds) {
      const data = await env.SUBMISSIONS_KV.get(id, 'json');
      if (data) {
        submissions.push(data);
      }
    }

    // 按时间倒序排序
    submissions.sort((a, b) => new Date(b.submitTime) - new Date(a.submitTime));

    return successResponse({ submissions }, '获取成功');
  } catch (error) {
    return errorResponse('获取提交列表失败', 500);
  }
}

// Admin 添加网站（直接添加，无需审核）
async function handleAdminAddSite(request, env) {
  const isAuthenticated = await verifyAdminToken(request, env);
  if (!isAuthenticated) {
    return errorResponse('未授权访问', 401);
  }

  try {
    const formData = await request.json();

    // 验证必填字段
    if (!formData.siteName || !formData.siteUrl || !formData.category || !formData.description) {
      return errorResponse('请填写所有必填字段');
    }

    if (!isValidUrl(formData.siteUrl)) {
      return errorResponse('网址格式不正确');
    }

    // 生成网站 ID
    const siteId = `site_${Date.now()}_${crypto.randomUUID()}`;
    
    // 准备存储的数据
    const siteData = {
      id: siteId,
      siteName: formData.siteName.trim(),
      siteUrl: formData.siteUrl.trim(),
      category: formData.category,
      description: formData.description.trim(),
      keywords: formData.keywords ? formData.keywords.trim() : '',
      logoPath: formData.logoPath ? formData.logoPath.trim() : '', // 保存 logo 路径
      addedBy: 'admin',
      addedAt: new Date().toISOString(),
      status: 'active',
    };

    // 保存到 KV
    await env.SITES_KV.put(siteId, JSON.stringify(siteData));
    
    // 添加到网站列表
    const sitesListKey = 'sites_list';
    const sitesList = await env.SITES_KV.get(sitesListKey, 'json') || [];
    sitesList.push(siteId);
    await env.SITES_KV.put(sitesListKey, JSON.stringify(sitesList));

    // 按分类组织
    const categoryKey = `category_${formData.category}`;
    const categoryList = await env.SITES_KV.get(categoryKey, 'json') || [];
    categoryList.push(siteId);
    await env.SITES_KV.put(categoryKey, JSON.stringify(categoryList));

    return successResponse({ siteId }, '网站添加成功');
  } catch (error) {
    return errorResponse('添加网站失败', 500);
  }
}

// 审核提交（批准或拒绝）
async function handleReviewSubmission(request, env) {
  const isAuthenticated = await verifyAdminToken(request, env);
  if (!isAuthenticated) {
    return errorResponse('未授权访问', 401);
  }

  try {
    const { submissionId, action } = await request.json(); // action: 'approve' or 'reject'

    if (!submissionId || !action) {
      return errorResponse('参数不完整');
    }

    // 获取提交数据
    const submissionData = await env.SUBMISSIONS_KV.get(submissionId, 'json');
    if (!submissionData) {
      return errorResponse('提交记录不存在');
    }

    if (action === 'approve') {
      // 批准：添加到网站列表
      const siteId = `site_${Date.now()}_${crypto.randomUUID()}`;
      const siteData = {
        id: siteId,
        siteName: submissionData.siteName,
        siteUrl: submissionData.siteUrl,
        category: submissionData.category,
        description: submissionData.description,
        keywords: submissionData.keywords,
        logoPath: submissionData.logoPath || '', // 保存 logo 路径
        addedBy: 'user_submission',
        addedAt: new Date().toISOString(),
        status: 'active',
      };

      await env.SITES_KV.put(siteId, JSON.stringify(siteData));
      
      const sitesListKey = 'sites_list';
      const sitesList = await env.SITES_KV.get(sitesListKey, 'json') || [];
      sitesList.push(siteId);
      await env.SITES_KV.put(sitesListKey, JSON.stringify(sitesList));

      const categoryKey = `category_${submissionData.category}`;
      const categoryList = await env.SITES_KV.get(categoryKey, 'json') || [];
      categoryList.push(siteId);
      await env.SITES_KV.put(categoryKey, JSON.stringify(categoryList));

      // 更新提交状态
      submissionData.status = 'approved';
      submissionData.reviewedAt = new Date().toISOString();
      await env.SUBMISSIONS_KV.put(submissionId, JSON.stringify(submissionData));

      // 从待审核列表移除，添加到已批准列表
      const pendingList = await env.SUBMISSIONS_KV.get('pending_submissions', 'json') || [];
      const newPendingList = pendingList.filter(id => id !== submissionId);
      await env.SUBMISSIONS_KV.put('pending_submissions', JSON.stringify(newPendingList));

      const approvedList = await env.SUBMISSIONS_KV.get('approved_submissions', 'json') || [];
      approvedList.push(submissionId);
      await env.SUBMISSIONS_KV.put('approved_submissions', JSON.stringify(approvedList));

      return successResponse({ siteId }, '已批准并添加到网站列表');
    } else if (action === 'reject') {
      // 拒绝：更新状态
      submissionData.status = 'rejected';
      submissionData.reviewedAt = new Date().toISOString();
      await env.SUBMISSIONS_KV.put(submissionId, JSON.stringify(submissionData));

      // 从待审核列表移除，添加到已拒绝列表
      const pendingList = await env.SUBMISSIONS_KV.get('pending_submissions', 'json') || [];
      const newPendingList = pendingList.filter(id => id !== submissionId);
      await env.SUBMISSIONS_KV.put('pending_submissions', JSON.stringify(newPendingList));

      const rejectedList = await env.SUBMISSIONS_KV.get('rejected_submissions', 'json') || [];
      rejectedList.push(submissionId);
      await env.SUBMISSIONS_KV.put('rejected_submissions', JSON.stringify(rejectedList));

      return successResponse({}, '已拒绝该提交');
    } else {
      return errorResponse('无效的操作');
    }
  } catch (error) {
    return errorResponse('审核失败', 500);
  }
}

// 获取所有网站（Admin）
async function handleGetSites(request, env) {
  const isAuthenticated = await verifyAdminToken(request, env);
  if (!isAuthenticated) {
    return errorResponse('未授权访问', 401);
  }

  try {
    const sitesListKey = 'sites_list';
    const siteIds = await env.SITES_KV.get(sitesListKey, 'json') || [];

    const sites = [];
    for (const id of siteIds) {
      const data = await env.SITES_KV.get(id, 'json');
      if (data) {
        sites.push(data);
      }
    }

    sites.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    return successResponse({ sites }, '获取成功');
  } catch (error) {
    return errorResponse('获取网站列表失败', 500);
  }
}
// 删除网站（Admin）
async function handleDeleteSite(request, env) {
  const isAuthenticated = await verifyAdminToken(request, env);
  if (!isAuthenticated) {
    return errorResponse('未授权访问', 401);
  }

  try {
    const { siteId } = await request.json();

    if (!siteId) {
      return errorResponse('网站ID不能为空');
    }

    // 获取网站数据
    const siteData = await env.SITES_KV.get(siteId, 'json');
    if (!siteData) {
      return errorResponse('网站不存在');
    }

    // 从网站列表中移除
    const sitesListKey = 'sites_list';
    const sitesList = await env.SITES_KV.get(sitesListKey, 'json') || [];
    const newSitesList = sitesList.filter(id => id !== siteId);
    await env.SITES_KV.put(sitesListKey, JSON.stringify(newSitesList));

    // 从分类列表中移除
    const categoryKey = `category_${siteData.category}`;
    const categoryList = await env.SITES_KV.get(categoryKey, 'json') || [];
    const newCategoryList = categoryList.filter(id => id !== siteId);
    await env.SITES_KV.put(categoryKey, JSON.stringify(newCategoryList));

    // 删除网站数据
    await env.SITES_KV.delete(siteId);
    // 如果网站是通过用户提交审核添加的，同时删除 SUBMISSIONS_KV 中的相关提交记录
    if (siteData.addedBy === 'user_submission') {
      // 通过网站URL查找并删除相关的提交记录
      const pendingList = await env.SUBMISSIONS_KV.get('pending_submissions', 'json') || [];
      const approvedList = await env.SUBMISSIONS_KV.get('approved_submissions', 'json') || [];
      const rejectedList = await env.SUBMISSIONS_KV.get('rejected_submissions', 'json') || [];
      
      // 合并所有提交ID列表
      const allSubmissionIds = [...pendingList, ...approvedList, ...rejectedList];
      
      // 查找匹配的提交记录（通过网站URL匹配）
      for (const submissionId of allSubmissionIds) {
        const submissionData = await env.SUBMISSIONS_KV.get(submissionId, 'json');
        if (submissionData && submissionData.siteUrl === siteData.siteUrl) {
          // 从对应的列表中移除
          if (pendingList.includes(submissionId)) {
            const newPendingList = pendingList.filter(id => id !== submissionId);
            await env.SUBMISSIONS_KV.put('pending_submissions', JSON.stringify(newPendingList));
          }
          if (approvedList.includes(submissionId)) {
            const newApprovedList = approvedList.filter(id => id !== submissionId);
            await env.SUBMISSIONS_KV.put('approved_submissions', JSON.stringify(newApprovedList));
          }
          if (rejectedList.includes(submissionId)) {
            const newRejectedList = rejectedList.filter(id => id !== submissionId);
            await env.SUBMISSIONS_KV.put('rejected_submissions', JSON.stringify(newRejectedList));
          }
          
          // 删除提交记录数据
          await env.SUBMISSIONS_KV.delete(submissionId);
          break; // 找到匹配的记录后退出循环
        }
      }
    }
    return successResponse({}, '网站删除成功');
  } catch (error) {
    return errorResponse('删除网站失败', 500);
  }
}
// 获取公开的网站列表（按分类组织，供前端使用）
async function handleGetPublicSites(request, env) {
  try {
    const sitesListKey = 'sites_list';
    const siteIds = await env.SITES_KV.get(sitesListKey, 'json') || [];

    // 获取所有网站
    const allSites = [];
    for (const id of siteIds) {
      const data = await env.SITES_KV.get(id, 'json');
      if (data && data.status === 'active') {
        allSites.push(data);
      }
    }

    // 按分类组织网站
    const sitesByCategory = {};
    allSites.forEach(site => {
      if (!sitesByCategory[site.category]) {
        sitesByCategory[site.category] = [];
      }
      sitesByCategory[site.category].push(site);
    });

    // 对每个分类的网站按添加时间排序
    Object.keys(sitesByCategory).forEach(category => {
      sitesByCategory[category].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    });

    return successResponse({ sitesByCategory }, '获取成功');
  } catch (error) {
    return errorResponse('获取网站列表失败', 500);
  }
}

// 主处理函数
export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // API 路由处理
      if (path.startsWith('/api/')) {
        if (path === '/api/submit' && request.method === 'POST') {
          return handleSubmit(request, env);
        }

        if (path === '/api/admin/login' && request.method === 'POST') {
          return handleAdminLogin(request, env);
        }

        if (path === '/api/admin/submissions' && request.method === 'GET') {
          return handleGetSubmissions(request, env);
        }

        if (path === '/api/admin/add-site' && request.method === 'POST') {
          return handleAdminAddSite(request, env);
        }

        if (path === '/api/admin/review' && request.method === 'POST') {
          return handleReviewSubmission(request, env);
        }

        if (path === '/api/admin/sites' && request.method === 'GET') {
          return handleGetSites(request, env);
        }
         // 删除网站 API
         if (path === '/api/admin/delete-site' && request.method === 'POST') {
          return handleDeleteSite(request, env);
        }
        // 公开的网站列表 API（供前端使用）
        if (path === '/api/sites' && request.method === 'GET') {
          return handleGetPublicSites(request, env);
        }

        // API 404
        return errorResponse('接口不存在', 404);
      }

      // 静态文件处理：如果不是 API 请求，转发到 Cloudflare Pages 或返回 index.html
      // 注意：这需要配合 Cloudflare Pages 使用，或者使用 Worker 的 Assets
      // 如果使用独立的 Worker，需要配置路由将静态文件请求转发到 Pages
      
      // 对于根路径，返回 index.html 的提示（实际应该由 Pages 处理）
      if (path === '/' || path === '/index.html') {
        // 如果使用 Pages + Worker，静态文件由 Pages 处理
        // 这里只处理 API 请求，静态文件应该通过 Pages 或 CDN 提供
        return new Response('请使用 Cloudflare Pages 托管静态文件，或配置 Worker 路由', {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            ...corsHeaders,
          },
        });
      }

      // 其他路径返回 404
      return errorResponse('页面不存在', 404);
    } catch (error) {
      return errorResponse('服务器错误', 500);
    }
  },
};



