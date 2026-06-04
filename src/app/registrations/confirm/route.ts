function redirectTo(request: Request, path: string) {
  return Response.redirect(new URL(path, request.url), 307);
}

export async function GET(request: Request) {
  return redirectTo(request, "/member?registration=member-only");
}
