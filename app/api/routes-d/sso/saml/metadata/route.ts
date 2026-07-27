import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'

const SP_ENTITY_ID = 'https://app.lancepay.io/sso/saml'
const SP_ACS_URL = 'https://app.lancepay.io/api/auth/saml/callback'
const SP_SLO_URL = 'https://app.lancepay.io/api/auth/saml/logout'
const CERT_PLACEHOLDER =
  'MIIBkTCB+wIJAJe8k3r5EXAMPLEPLACEHOLDER0...(replace with real SP certificate)'

function buildSamlMetadataXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor
  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${SP_ENTITY_ID}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${CERT_PLACEHOLDER}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${SP_SLO_URL}"/>
    <md:NameIDFormat>
      urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress
    </md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${SP_ACS_URL}"
      index="1"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`
}

export async function GET(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('application/xml') || accept.includes('text/xml')) {
    return new NextResponse(buildSamlMetadataXml(), {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  return NextResponse.json({
    entityId: SP_ENTITY_ID,
    acsUrl: SP_ACS_URL,
    sloUrl: SP_SLO_URL,
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    wantAssertionsSigned: true,
    authnRequestsSigned: false,
    xmlEndpoint: `${SP_ENTITY_ID}/metadata.xml`,
  })
}
